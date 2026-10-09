// @effect-diagnostics nodeBuiltinImport:off - the tests build a pack directory on disk.
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

/**
 * The end-to-end behaviour (a `recipe.ts` outside any install resolving `@t3team/sdk`) cannot be
 * exercised here: `vp test` runs through vite-plus, which owns module resolution in this
 * environment, so a Node `registerHooks` fallback never fires. What IS worth pinning is the
 * allow-list — it is a security boundary, not a convenience.
 */
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

  it("prefers what the server's installation resolves", () => {
    const hostUrl = bundleDir(["t3team-hostEffect.mjs"]);
    expect(resolveFromHost("effect", hostUrl, () => "file:///installed/effect.js")).toBe(
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

describe("withConfigVersion", () => {
  const parent = "file:///repo/.nexi/recipes/pr-watch.config.ts?t3team-config=42";

  it("versions a config's file imports with the config's own version", () => {
    expect(withConfigVersion("file:///repo/.nexi/policies/merge.ts", parent)).toBe(
      "file:///repo/.nexi/policies/merge.ts?t3team-config=42",
    );
  });

  it("leaves packages, unversioned parents and already-versioned children alone", () => {
    expect(withConfigVersion("node:fs", parent)).toBe("node:fs");
    expect(withConfigVersion("file:///repo/x.ts", "file:///repo/recipe.ts?v=1")).toBe(
      "file:///repo/x.ts",
    );
    expect(withConfigVersion("file:///repo/x.ts?t3team-config=7", parent)).toBe(
      "file:///repo/x.ts?t3team-config=7",
    );
    expect(withConfigVersion("file:///repo/x.ts", undefined)).toBe("file:///repo/x.ts");
  });
});
