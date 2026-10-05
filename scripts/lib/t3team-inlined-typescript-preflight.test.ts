// @effect-diagnostics nodeBuiltinImport:off - builds fake workspace node_modules layouts on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import {
  declaredMajor,
  InlinedTypeScriptResolutionError,
  isInlinableTypeScript,
  preflightInlinedTypeScript,
  resolveInlinedTypeScript,
} from "./t3team-inlined-typescript-preflight.ts";

const writeJson = (file: string, value: unknown): void => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, JSON.stringify(value));
};

/** A classic compiler package: main is lib/typescript.js. */
const writeClassicTypeScript = (dir: string, version: string): void => {
  writeJson(NodePath.join(dir, "package.json"), {
    name: "typescript",
    version,
    main: "./lib/typescript.js",
  });
  NodeFS.mkdirSync(NodePath.join(dir, "lib"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(dir, "lib", "typescript.js"), "module.exports = {};");
};

/** The typescript@7 (tsgo) layout: main is a tiny lib/version.cjs shim. */
const writeTsgoTypeScript = (dir: string, version: string): void => {
  writeJson(NodePath.join(dir, "package.json"), {
    name: "typescript",
    version,
    main: "./lib/version.cjs",
  });
  NodeFS.mkdirSync(NodePath.join(dir, "lib"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(dir, "lib", "version.cjs"), "module.exports = {};");
};

const makeWorkspace = (options: {
  readonly rootTsgo: boolean;
  readonly runbookTs: "classic" | "missing" | "classic-wrong-major";
}): string => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "inlined-ts-preflight-"));
  writeJson(NodePath.join(root, "packages", "runbook-ts", "package.json"), {
    name: "@runbook/ts",
    dependencies: { typescript: "~6.0.3" },
  });
  if (options.rootTsgo)
    writeTsgoTypeScript(NodePath.join(root, "node_modules", "typescript"), "7.0.2");
  const runbookTsTypeScript = NodePath.join(
    root,
    "packages",
    "runbook-ts",
    "node_modules",
    "typescript",
  );
  if (options.runbookTs === "classic") writeClassicTypeScript(runbookTsTypeScript, "6.0.3");
  if (options.runbookTs === "classic-wrong-major")
    writeClassicTypeScript(runbookTsTypeScript, "5.9.3");
  return root;
};

describe("declaredMajor", () => {
  it("reads the major from ranges and exact versions", () => {
    assert.strictEqual(declaredMajor("~6.0.3"), 6);
    assert.strictEqual(declaredMajor("^6.0.0"), 6);
    assert.strictEqual(declaredMajor("7.0.2"), 7);
    assert.strictEqual(declaredMajor("catalog:"), undefined);
  });
});

describe("resolveInlinedTypeScript", () => {
  it("accepts runbook-ts's own classic compiler even when the root carries tsgo", () => {
    const resolved = resolveInlinedTypeScript(
      makeWorkspace({ rootTsgo: true, runbookTs: "classic" }),
    );
    assert.strictEqual(resolved.version, "6.0.3");
    assert.isTrue(resolved.hasClassicEntry);
    assert.isTrue(isInlinableTypeScript(resolved));
  });

  it("rejects the stale install that falls through to the root tsgo shim", () => {
    const resolved = resolveInlinedTypeScript(
      makeWorkspace({ rootTsgo: true, runbookTs: "missing" }),
    );
    assert.strictEqual(resolved.version, "7.0.2");
    assert.isFalse(resolved.hasClassicEntry);
    assert.isFalse(isInlinableTypeScript(resolved));
  });

  it("rejects a classic compiler whose major differs from the declared range", () => {
    const resolved = resolveInlinedTypeScript(
      makeWorkspace({ rootTsgo: false, runbookTs: "classic-wrong-major" }),
    );
    assert.isTrue(resolved.hasClassicEntry);
    assert.isFalse(isInlinableTypeScript(resolved));
  });
});

describe("preflightInlinedTypeScript", () => {
  it.effect("fails with an actionable install hint on the stale layout", () =>
    Effect.gen(function* () {
      const root = makeWorkspace({ rootTsgo: true, runbookTs: "missing" });
      const exit = yield* Effect.exit(preflightInlinedTypeScript(root));
      assert.isTrue(Exit.isFailure(exit));
      const error = Exit.isFailure(exit) ? exit.cause : undefined;
      const message = String(error);
      assert.include(message, "InlinedTypeScriptResolutionError");
      assert.include(message, "pnpm install --frozen-lockfile");
      assert.include(message, "7.0.2");
    }),
  );

  it.effect("passes on the real workspace install", () =>
    Effect.gen(function* () {
      const repoRoot = NodeURL.fileURLToPath(new URL("../..", import.meta.url));
      yield* preflightInlinedTypeScript(repoRoot);
    }),
  );

  it("names the declared and resolved versions in the message", () => {
    const error = new InlinedTypeScriptResolutionError({
      repoRoot: "/repo",
      declared: "~6.0.3",
      resolvedVersion: "7.0.2",
      resolvedPath: "/repo/node_modules/typescript",
    });
    assert.include(error.message, '"~6.0.3"');
    assert.include(error.message, "typescript 7.0.2");
    assert.include(error.message, "/repo");
  });
});
