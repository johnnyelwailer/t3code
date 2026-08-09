/** T3Team's anchor adapter over the reusable TypeScript compiler host. */

import * as NodeURL from "node:url";

export {
  getTypeCheckHost,
  resetTypeCheckHosts,
  typeCheckCompilerOptions,
} from "@runbook/ts/typeCheckHost";
export type { TypeCheckHost, TypeCheckHostStats } from "@runbook/ts/typeCheckHost";

/** Resolve authoring specifiers from the installed T3Team SDK package. */
export function defaultAnchorPath(): string {
  return NodeURL.fileURLToPath(import.meta.url);
}
