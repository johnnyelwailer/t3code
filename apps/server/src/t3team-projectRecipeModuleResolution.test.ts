// @effect-diagnostics nodeBuiltinImport:off - the tests build a pack directory on disk.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  ensureProjectRecipeModuleResolution,
  isResolvableFromHost,
  resolveFromHost,
  withConfigVersion,
} from "./t3team-projectRecipeModuleResolution.ts";

/** The allow-list is a security boundary, not a convenience. */
describe("isResolvableFromHost", () => {
  it("allows the authoring SDK and its subpaths", () => {
    expect(isResolvableFromHost("@t3team/sdk")).toBe(true);
    expect(isResolvableFromHost("@t3team/sdk/placements")).toBe(true);
  });

  // A recipe's scripts/<name>.ts declares its schemas with `Schema` and is reached by a real
  // (non-type-only) import from recipe.ts, so `effect` has to resolve too.
  it("allows effect and its subpaths", () => {
    expect(isResolvableFromHost("effect")).toBe(true);
    expect(isResolvableFromHost("effect/Schema")).toBe(true);
  });

  it("refuses everything else, so a recipe cannot reach the host's dependency tree", () => {
    for (const specifier of [
      "@t3tools/contracts",
      "@t3tools/project-recipes",
      "node:fs",
      "express",
      "../../apps/server/src/secrets.ts",
      "@t3team/sdk-evil",
      "effect-evil",
      "",
    ]) {
      expect(isResolvableFromHost(specifier)).toBe(false);
    }
  });
});

describe("ensureProjectRecipeModuleResolution", () => {
  // Every recipe/workflow import path calls this; stacking duplicate resolve frames per import
  // would be a slow leak rather than a visible failure, so the idempotence is worth a test.
  it("is idempotent", () => {
    expect(() => {
      ensureProjectRecipeModuleResolution();
      ensureProjectRecipeModuleResolution();
      ensureProjectRecipeModuleResolution();
    }).not.toThrow();
  });
});

describe("resolveFromHost", () => {
  const notInstalled = () => {
    throw new Error("ERR_MODULE_NOT_FOUND");
  };
  const bundleDir = (files: ReadonlyArray<string>) => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "host-modules-"));
    for (const file of files) NodeFS.writeFileSync(NodePath.join(dir, file), "export {};\n");
    return NodeURL.pathToFileURL(NodePath.join(dir, "server-abc123.mjs")).href;
  };

  // The packaged desktop app installs @t3team/sdk as raw .ts under node_modules, which Node will
  // not type-strip; the bundle entry is the only copy that loads, and the one the host runs.
  it("prefers the bundle's host-module entry over an installed copy", () => {
    const hostUrl = bundleDir(["t3team-hostSdk.mjs"]);
    const installedTs = () => "file:///app/node_modules/@t3team/sdk/src/t3team-sdk.index.ts";
    expect(resolveFromHost("@t3team/sdk", hostUrl, installedTs)).toBe(
      new URL("./t3team-hostSdk.mjs", hostUrl).href,
    );
  });

  it("uses the server's installation when there is no bundle entry", () => {
    expect(resolveFromHost("effect", bundleDir([]), () => "file:///installed/effect.js")).toBe(
      "file:///installed/effect.js",
    );
  });

  // A published bundle inlines effect and @t3team/sdk and installs neither: the recipe must land on
  // the bundle's own entries, never on a second copy.
  it("falls back to the bundle's host-module entries when the packages are not installed", () => {
    const hostUrl = bundleDir(["t3team-hostEffect.mjs", "t3team-hostSdk.mjs"]);
    const beside = (name: string) => new URL(name, hostUrl).href;
    expect(resolveFromHost("effect", hostUrl, notInstalled)).toBe(
      beside("./t3team-hostEffect.mjs"),
    );
    expect(resolveFromHost("@t3team/sdk", hostUrl, notInstalled)).toBe(
      beside("./t3team-hostSdk.mjs"),
    );
  });

  it("rethrows when neither the installation nor the bundle has the module", () => {
    expect(() => resolveFromHost("effect", bundleDir([]), notInstalled)).toThrow(
      "ERR_MODULE_NOT_FOUND",
    );
    // subpaths have no bundle entry, and the error says what to write instead
    expect(() =>
      resolveFromHost("effect/Schema", bundleDir(["t3team-hostEffect.mjs"]), notInstalled),
    ).toThrow('recipe modules may import only the bare "effect"');
  });

  // The load-bearing claim of the published-bundle path: a recipe that lands on the host entry
  // must share the SAME Schema chunk the server imports. Fake temp dirs cannot prove it — only
  // the real `dist/` after `build:bundle`. (Dynamic import of these chunks fails under vitest
  // because of shebang/`import.meta.env` prefixes; the static import graph is the identity proof.)
  it("the built host entry and the server chunk share one Schema module", () => {
    const dist = NodePath.resolve(import.meta.dirname, "../dist");
    const hostEffectPath = NodePath.join(dist, "t3team-hostEffect.mjs");
    if (!NodeFS.existsSync(hostEffectPath)) {
      // Local unit runs without a prior build; CI that builds the bundle keeps this gate.
      return;
    }
    const serverChunk = NodeFS.readdirSync(dist).find(
      (name) => name.startsWith("server-") && name.endsWith(".mjs"),
    );
    expect(serverChunk).toBeDefined();
    const hostUrl = NodeURL.pathToFileURL(NodePath.join(dist, serverChunk!)).href;
    expect(resolveFromHost("effect", hostUrl, notInstalled)).toBe(
      NodeURL.pathToFileURL(hostEffectPath).href,
    );

    const schemaFrom = (source: string) => {
      const match = source.match(/from\s*"(\.\/Schema-[^"]+\.mjs)"/);
      expect(match?.[1]).toBeDefined();
      return match![1]!;
    };
    const serverSource = NodeFS.readFileSync(NodePath.join(dist, serverChunk!), "utf8");
    const hostSource = NodeFS.readFileSync(hostEffectPath, "utf8");
    expect(schemaFrom(serverSource)).toBe(schemaFrom(hostSource));
    expect(NodeFS.existsSync(NodePath.join(dist, schemaFrom(hostSource).slice(2)))).toBe(true);
  });
});

/**
 * Runs the hook in a real Node process (vite-plus owns resolution under `vp test`) against the
 * packaged desktop layout: the server bundle sits beside a `node_modules/@t3team/sdk` holding raw
 * `.ts` sources, and the project's path contains a space, like `projects/Nexi AI`.
 */
describe("a project recipe imported by the packaged server", () => {
  const write = (file: string, content: string) => {
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, content);
  };

  const makePackagedLayout = () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "recipe host "));
    const install = NodePath.join(root, "server asar");
    const dist = NodePath.join(install, "apps", "server", "dist");
    const sdk = NodePath.join(install, "node_modules", "@t3team", "sdk");
    write(NodePath.join(root, "package.json"), '{ "type": "module" }');
    write(
      NodePath.join(sdk, "package.json"),
      '{ "name": "@t3team/sdk", "type": "module", "exports": { ".": { "import": "./src/index.ts" } } }',
    );
    write(NodePath.join(sdk, "src", "index.ts"), "export const defineRecipe = (r: object) => r;\n");
    write(
      NodePath.join(dist, "t3team-hostSdk.mjs"),
      [
        'export const defineRecipe = (recipe) => ({ ...recipe, kind: "recipe", from: "bundle" });',
        'export const definePrompt = (path) => ({ kind: "prompt", path });',
      ].join("\n"),
    );
    NodeFS.copyFileSync(
      NodeURL.fileURLToPath(new URL("./t3team-projectRecipeModuleResolution.ts", import.meta.url)),
      NodePath.join(dist, "server-abc123.ts"),
    );
    const recipe = NodePath.join(
      root,
      "Nexi AI",
      ".nexi",
      "recipes",
      "next-best-task",
      "recipe.ts",
    );
    write(
      recipe,
      [
        'import { definePrompt, defineRecipe } from "@t3team/sdk";',
        'export default defineRecipe({ id: "next-best-task", defaultAction: definePrompt("./prompt.md") });',
      ].join("\n"),
    );
    const loader = NodePath.join(root, "load.mjs");
    write(
      loader,
      [
        "const [host, recipe] = process.argv.slice(2);",
        "(await import(host)).ensureProjectRecipeModuleResolution();",
        "try {",
        "  const { default: ref } = await import(recipe);",
        "  process.stdout.write(JSON.stringify({ id: ref.id, from: ref.from }));",
        "} catch (error) {",
        "  process.stdout.write(JSON.stringify({ code: error.code, message: error.message }));",
        "}",
      ].join("\n"),
    );
    return { host: NodePath.join(dist, "server-abc123.ts"), recipe, loader };
  };

  it("loads the recipe against the bundle's SDK, not the installed .ts sources", () => {
    const layout = makePackagedLayout();
    const output = NodeChildProcess.execFileSync(
      process.execPath,
      [
        layout.loader,
        NodeURL.pathToFileURL(layout.host).href,
        `${NodeURL.pathToFileURL(layout.recipe).href}?v=1`,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output)).toEqual({ id: "next-best-task", from: "bundle" });
  });
});

describe("withConfigVersion", () => {
  const parent = "file:///repo/.nexi/recipes/pr-watch.config.ts?t3team-config=42";

  it("versions a config's file imports with the config's own version", () => {
    expect(
      withConfigVersion("file:///repo/.nexi/policies/merge.ts", parent, "../policies/merge.ts"),
    ).toBe("file:///repo/.nexi/policies/merge.ts?t3team-config=42");
  });

  it("leaves packages, unversioned parents and already-versioned children alone", () => {
    expect(withConfigVersion("node:fs", parent, "node:fs")).toBe("node:fs");
    // A package resolves to a file too; it must not be loaded again per config version.
    const sdk = "file:///repo/node_modules/@t3team/sdk/src/t3team-sdk.index.ts";
    expect(withConfigVersion(sdk, parent, "@t3team/sdk")).toBe(sdk);
    expect(withConfigVersion("file:///repo/x.ts", "file:///repo/recipe.ts?v=1", "./x.ts")).toBe(
      "file:///repo/x.ts",
    );
    expect(withConfigVersion("file:///repo/x.ts?t3team-config=7", parent, "./x.ts")).toBe(
      "file:///repo/x.ts?t3team-config=7",
    );
    expect(withConfigVersion("file:///repo/x.ts", undefined, "./x.ts")).toBe("file:///repo/x.ts");
  });
});
