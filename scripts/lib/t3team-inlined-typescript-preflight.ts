// @effect-diagnostics nodeBuiltinImport:off - resolves typescript exactly the way the server pack's bundler does.
// @effect-diagnostics preferSchemaOverJson:off - package.json is an on-disk boundary, not a domain payload.
/**
 * Fail-fast check that the server pack will inline the CLASSIC TypeScript
 * compiler, run before the desktop build spends minutes producing a bundle the
 * self-containment probe would reject.
 *
 * packages/runbook-ts pins classic typescript (~6.x) because the server bundle
 * inlines the compiler: TypeScript 7 (tsgo) ships a tiny `lib/version.cjs`
 * entry plus a native per-platform binary, which cannot be inlined and has no
 * createSourceFile/transpileModule API. The workspace root carries typescript
 * 7 for the toolchain. If packages/runbook-ts/node_modules/typescript is
 * missing (a stale or partial install), Node resolution walks up to the root
 * and the bundler silently inlines the tsgo shim instead — the probe in
 * scripts/build-desktop-artifact.ts then fails only after the full build.
 *
 * This resolves `typescript` from packages/runbook-ts exactly as the bundler
 * does and asserts it is the version the package declares, with the classic
 * compiler entry on disk.
 */

import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class InlinedTypeScriptResolutionError extends Schema.TaggedError<InlinedTypeScriptResolutionError>()(
  "InlinedTypeScriptResolutionError",
  {
    repoRoot: Schema.String,
    declared: Schema.String,
    resolvedVersion: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `packages/runbook-ts declares typescript "${this.declared}", but resolving it the way the server bundler does yields typescript ${this.resolvedVersion} (${this.resolvedPath}). The server bundle must inline the classic compiler (lib/typescript.js); TypeScript 7 (tsgo) cannot be inlined, so the bundle would fail the self-containment probe after the full build. The workspace install is out of sync with pnpm-lock.yaml (packages/runbook-ts/node_modules/typescript is missing or wrong). Run \`pnpm install --frozen-lockfile\` in ${this.repoRoot} and rebuild.`;
  }
}

export interface ResolvedInlinedTypeScript {
  readonly declared: string;
  readonly version: string;
  readonly packageDir: string;
  readonly hasClassicEntry: boolean;
}

/** The leading major version of a semver range such as "~6.0.3" or "^6.0.0". */
export const declaredMajor = (spec: string): number | undefined => {
  const match = /(\d+)\./.exec(spec);
  return match ? Number(match[1]) : undefined;
};

/** Walk up from a resolved entry file to the `typescript` package root. */
const findTypeScriptPackageDir = (entry: string): string | undefined => {
  let dir = NodePath.dirname(entry);
  while (dir !== NodePath.dirname(dir)) {
    const manifest = NodePath.join(dir, "package.json");
    if (NodeFS.existsSync(manifest)) {
      const parsed = JSON.parse(NodeFS.readFileSync(manifest, "utf8")) as { name?: string };
      if (parsed.name === "typescript") return dir;
    }
    dir = NodePath.dirname(dir);
  }
  return undefined;
};

export const resolveInlinedTypeScript = (repoRoot: string): ResolvedInlinedTypeScript => {
  const runbookTsManifest = NodePath.join(repoRoot, "packages", "runbook-ts", "package.json");
  const manifest = JSON.parse(NodeFS.readFileSync(runbookTsManifest, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const declared = manifest.dependencies?.["typescript"] ?? "<undeclared>";
  const entry = NodeModule.createRequire(runbookTsManifest).resolve("typescript");
  const packageDir = findTypeScriptPackageDir(entry) ?? NodePath.dirname(entry);
  const packageJsonPath = NodePath.join(packageDir, "package.json");
  const version = NodeFS.existsSync(packageJsonPath)
    ? ((JSON.parse(NodeFS.readFileSync(packageJsonPath, "utf8")) as { version?: string }).version ??
      "<unknown>")
    : "<unknown>";
  const hasClassicEntry = NodeFS.existsSync(NodePath.join(packageDir, "lib", "typescript.js"));
  return { declared, version, packageDir, hasClassicEntry };
};

export const isInlinableTypeScript = (resolved: ResolvedInlinedTypeScript): boolean => {
  const expectedMajor = declaredMajor(resolved.declared);
  return (
    resolved.hasClassicEntry &&
    expectedMajor !== undefined &&
    declaredMajor(resolved.version) === expectedMajor
  );
};

export const preflightInlinedTypeScript = Effect.fn("desktopArtifact.preflightInlinedTypeScript")(
  function* (repoRoot: string) {
    const resolved = yield* Effect.try({
      try: () => resolveInlinedTypeScript(repoRoot),
      catch: (cause) =>
        new InlinedTypeScriptResolutionError({
          repoRoot,
          declared: "<unreadable>",
          resolvedVersion: "<unresolvable>",
          resolvedPath: String(cause),
        }),
    });
    if (!isInlinableTypeScript(resolved)) {
      return yield* new InlinedTypeScriptResolutionError({
        repoRoot,
        declared: resolved.declared,
        resolvedVersion: resolved.version,
        resolvedPath: resolved.packageDir,
      });
    }
    yield* Effect.log(
      `[desktop-artifact] Server bundle will inline typescript ${resolved.version} (runbook-ts declares ${resolved.declared}).`,
    );
  },
);
