/** Load the TypeScript compiler once for all trusted source-analysis helpers. */

import * as NodeModule from "node:module";
import * as TsApi from "typescript";

import { WorkflowLoadError } from "@runbook/core/errors";

// The compiler is a STATIC import so `vp pack` inlines it into the server
// bundle (apps/server's pack config bundles `typescript` with CJS shims). That
// is what makes the orchestration host work from the packaged asar, where no
// `node_modules/typescript` is reachable. In unbundled contexts (dev, tests)
// the same import resolves to the workspace package.
//
// The createRequire fallback covers a bundle that externalized typescript
// again: instead of the chunk crashing at module init, load the real package
// from the runtime's node_modules (the desktop build stages a trimmed copy
// into the asar's node_modules for exactly this reason).
const nodeRequire = NodeModule.createRequire(import.meta.url);

let cachedTs: typeof TsApi | undefined;

export function loadTypeScript(): typeof TsApi {
  cachedTs ??= pickUsableTypeScript(TsApi, () => nodeRequire("typescript"));
  return cachedTs;
}

/**
 * Pick the first candidate that actually exposes the JavaScript compiler API.
 *
 * Both candidates are validated before use: module resolution can succeed for
 * a package whose `.` export is a version-only stub (the typescript@7+ layout,
 * whose entry is `lib/version.cjs` and whose compiler surface moved behind
 * native bindings). Caching such a module would not fail here — it would fail
 * later, deep inside `prepareWorkflow`, as a cryptic
 * `Cannot read properties of undefined (reading 'Latest')` (`ts.ScriptTarget`
 * is undefined on the stub) with no hint that module resolution is the
 * problem. Failing at this load boundary instead names the defect.
 *
 * Exported so tests can exercise the candidate selection without mocking the
 * module loader.
 */
export function pickUsableTypeScript(
  staticImport: unknown,
  loadFallback: () => unknown,
): typeof TsApi {
  if (isUsableTypeScript(staticImport)) return staticImport;
  let fallback: unknown;
  try {
    fallback = loadFallback();
  } catch (error) {
    throw unavailableError(
      `the require fallback threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (isUsableTypeScript(fallback)) return fallback;
  throw unavailableError(
    `the require fallback resolved a module without the compiler API (its version field reads ${versionOf(
      fallback,
    )})`,
  );
}

function unavailableError(detail: string): WorkflowLoadError {
  return new WorkflowLoadError(
    `The TypeScript compiler API is unavailable to the workflow host (detail: ${detail}). ` +
      `@runbook/ts needs the JavaScript compiler package (typescript ~6.0.3) — a version-only stub ` +
      `(typescript@7's layout exports only the version from its entry) or a pruned node_modules ` +
      `will not work. Reinstall from the workspace lockfile and confirm ` +
      `packages/runbook-ts/node_modules/typescript resolves to the ~6.0.3 package.`,
  );
}

function versionOf(candidate: unknown): string {
  try {
    const mod = candidate as { version?: unknown } | null;
    return typeof mod === "object" && mod !== null && "version" in mod
      ? String(mod.version)
      : "<none>";
  } catch {
    return "<unreadable>";
  }
}

function isUsableTypeScript(candidate: unknown): candidate is typeof TsApi {
  const mod = candidate as Partial<typeof TsApi> | null | undefined;
  return (
    typeof mod?.createSourceFile === "function" &&
    typeof mod?.transpileModule === "function" &&
    typeof mod?.createCompilerHost === "function"
  );
}
