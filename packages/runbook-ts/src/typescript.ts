/** Load the TypeScript compiler once for all trusted source-analysis helpers. */

import * as NodeModule from "node:module";
import * as TsApi from "typescript";

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
  cachedTs ??= isUsableTypeScript(TsApi) ? TsApi : (nodeRequire("typescript") as typeof TsApi);
  return cachedTs;
}

function isUsableTypeScript(candidate: unknown): candidate is typeof TsApi {
  const mod = candidate as Partial<typeof TsApi> | null | undefined;
  return (
    typeof mod?.createSourceFile === "function" &&
    typeof mod?.transpileModule === "function" &&
    typeof mod?.createCompilerHost === "function"
  );
}
