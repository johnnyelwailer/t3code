import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

/**
 * The cloud-session dispatch modules are shared with the React Native phone, which has no Node, no
 * server tree and no desktop services. These checks keep that true: a static walk of every import
 * reachable from each subpath, and a real import under Node's permission model that can read only
 * `packages/shared`, `packages/contracts` and `node_modules`, never `apps/`.
 */
const SHARED_ROOT = NodePath.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPO_ROOT = NodePath.resolve(SHARED_ROOT, "..", "..");

const SUBPATHS = [
  "t3team-cloudSessionActionsRequests",
  "t3team-cloudSessionActionsParse",
  "t3team-cloudSessionRunOwnership",
  "t3team-cloudSessionPhase",
  "t3team-cloudSessionEnvironmentStep",
  "t3team-cloudSessionWorkspace",
  "t3team-cloudSessionPlainProject",
  "t3team-cloudSessionName",
  "t3team-cloudSessionDispatchPlan",
] as const;

const sourceOf = (name: string) => NodePath.join(SHARED_ROOT, "src", `${name}.ts`);

const specifiersOf = (source: string): string[] =>
  [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g)].map(
    (match) => match[1]!,
  );

/** Every module reachable through relative or `@t3tools/shared/*` imports, plus external specifiers. */
function walk(entry: string) {
  const files = new Set<string>();
  const external = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of specifiersOf(NodeFS.readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        pending.push(NodePath.resolve(NodePath.dirname(file), specifier));
      } else if (specifier.startsWith("@t3tools/shared/")) {
        pending.push(sourceOf(specifier.slice("@t3tools/shared/".length)));
      } else {
        external.add(specifier);
      }
    }
  }
  return { files: [...files], external: [...external] };
}

const ALLOWED_EXTERNAL = /^(?:@t3tools\/contracts|effect(?:\/[A-Za-z]+)?)$/;

describe("cloud-session shared subpaths", () => {
  it("has an explicit export entry per subpath, each pointing at an existing source file", () => {
    const pkg = JSON.parse(
      NodeFS.readFileSync(NodePath.join(SHARED_ROOT, "package.json"), "utf8"),
    ) as {
      exports: Record<string, { types: string; import: string }>;
    };
    for (const name of SUBPATHS) {
      const entry = pkg.exports[`./${name}`];
      expect(entry, name).toEqual({ types: `./src/${name}.ts`, import: `./src/${name}.ts` });
      expect(NodeFS.existsSync(sourceOf(name)), name).toBe(true);
    }
  });

  it.each(SUBPATHS)("%s reaches no Node builtin, server file or desktop service", (name) => {
    const { files, external } = walk(sourceOf(name));
    for (const specifier of external) {
      expect(specifier, `${name} imports ${specifier}`).toMatch(ALLOWED_EXTERNAL);
    }
    for (const file of files) {
      expect(file.startsWith(NodePath.join(SHARED_ROOT, "src") + NodePath.sep), file).toBe(true);
      const source = NodeFS.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /\bprocess\.(?:env|cwd|argv)\b|\brequire\(|\bURL\.parse\b|await\s+import\(/,
      );
      expect(source, file).not.toMatch(/\beffect\/(?:DateTime|Schedule|unstable)/);
    }
  });

  it("imports under plain Node with `apps/` unreadable, and the sandbox really denies it", () => {
    const readable = [
      SHARED_ROOT,
      NodePath.join(REPO_ROOT, "packages", "contracts"),
      NodePath.join(REPO_ROOT, "node_modules"),
    ];
    const flags = ["--permission", ...readable.map((path) => `--allow-fs-read=${path}`)];
    const run = (script: string, ...args: string[]) =>
      NodeChildProcess.spawnSync(
        process.execPath,
        [...flags, "--input-type=module", "-e", script, ...args],
        {
          encoding: "utf8",
        },
      );

    const imported = run(
      "const out = {}; for (const url of process.argv.slice(1)) out[url] = Object.keys(await import(url)).length; console.log(JSON.stringify(out));",
      ...SUBPATHS.map((name) => pathToFileURL(sourceOf(name)).href),
    );
    expect(imported.stderr).toBe("");
    expect(imported.status).toBe(0);
    const counts = JSON.parse(imported.stdout) as Record<string, number>;
    expect(Object.values(counts).every((count) => count > 0)).toBe(true);

    const control = run(
      "await import(process.argv[1])",
      pathToFileURL(NodePath.join(REPO_ROOT, "apps", "server", "package.json")).href,
    );
    expect(control.status).not.toBe(0);
    expect(control.stderr).toContain("ERR_ACCESS_DENIED");
  });
});
