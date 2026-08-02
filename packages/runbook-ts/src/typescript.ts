/** Lazily load the TypeScript compiler once for all trusted source-analysis helpers. */

import * as NodeModule from "node:module";

import type * as TsApi from "typescript";

const nodeRequire = NodeModule.createRequire(import.meta.url);
let cachedTs: typeof TsApi | undefined;

export function loadTypeScript(): typeof TsApi {
  cachedTs ??= nodeRequire("typescript") as typeof TsApi;
  return cachedTs;
}
