// @effect-diagnostics nodeBuiltinImport:off - the tests build recipe directories on disk and spawn Node.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { afterAll, describe, expect, it } from "vite-plus/test";

const RESOLUTION_MODULE = NodeURL.fileURLToPath(
  new URL("./t3team-projectRecipeModuleResolution.ts", import.meta.url),
);

const roots: Array<string> = [];
afterAll(() => {
  for (const root of roots) NodeFS.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, content);
}

/** A recipe whose only module-ness is its syntax, like every real `recipe.ts`. */
function writeRecipe(workspace: string): string {
  const dir = NodePath.join(workspace, ".nexi", "recipes", "esm-only");
  write(NodePath.join(dir, "answer.ts"), "export const answer: number = 42;\n");
  const recipe = NodePath.join(dir, "recipe.ts");
  write(
    recipe,
    [
      'import { answer } from "./answer.ts";',
      'export default { kind: "recipe", answer, loadedFrom: import.meta.url };',
    ].join("\n"),
  );
  return recipe;
}

/** Runs the hook in a real Node process: vite-plus owns module loading under `vp test`. */
function importInFreshNode(recipe: string): { readonly answer?: number; readonly error?: string } {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "recipe-esm-driver-"));
  roots.push(root);
  const driver = NodePath.join(root, "drive.mjs");
  write(
    driver,
    [
      "const [host, recipe] = process.argv.slice(2);",
      "(await import(host)).ensureProjectRecipeModuleResolution();",
      "try {",
      "  const { default: ref } = await import(recipe);",
      "  process.stdout.write(JSON.stringify({ answer: ref.answer }));",
      "} catch (error) {",
      "  process.stdout.write(JSON.stringify({ error: String(error.message).slice(0, 200) }));",
      "}",
    ].join("\n"),
  );
  const result = NodeChildProcess.spawnSync(
    process.execPath,
    [
      "--no-warnings",
      driver,
      NodeURL.pathToFileURL(RESOLUTION_MODULE).href,
      NodeURL.pathToFileURL(recipe).href,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(result.stdout);
}

const ANCESTOR_PACKAGE_JSONS: ReadonlyArray<readonly [string, string | undefined]> = [
  ["no package.json", undefined],
  ['a package.json without "type"', '{ "name": "host-workspace" }'],
  ['a package.json with "type": "commonjs"', '{ "name": "host-workspace", "type": "commonjs" }'],
];

describe("a project recipe imported by the server", () => {
  it.each(ANCESTOR_PACKAGE_JSONS)(
    "loads as ESM whatever an ancestor has: %s",
    (_label, packageJson) => {
      const workspace = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "recipe esm "));
      roots.push(workspace);
      if (packageJson !== undefined) write(NodePath.join(workspace, "package.json"), packageJson);

      expect(importInFreshNode(writeRecipe(workspace))).toEqual({ answer: 42 });
    },
  );
});
