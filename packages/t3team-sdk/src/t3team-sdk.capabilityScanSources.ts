/** Which signal source a `getSignalSource`/`watermark` call binds, for the static capability scan. */
import type * as TsApi from "typescript";

import { BUILTIN_SIGNAL_GLOBALS } from "./t3team-sdk.builtinSignals.ts";
import { resolveVerb, type WorkflowBodyBindings } from "./t3team-sdk.workflowShapeBindings.ts";

/** Built-in source declaration export name → source name (`ScmChangeRequestWatch` → `scm.…`). */
const BUILTIN_SOURCE_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(BUILTIN_SIGNAL_GLOBALS).flatMap(([exportName, value]) => {
    const ref = value as { readonly kind?: unknown; readonly name?: unknown };
    return ref.kind === "signalSource" && typeof ref.name === "string"
      ? [[exportName, ref.name] as const]
      : [];
  }),
);

/**
 * The source a `getSignalSource`/`watermark` call binds, when it is knowable statically: a
 * built-in source declaration for `getSignalSource`, a string literal key for `watermark`.
 * Anything else (an author-defined source, a computed key) stays silent — miss > false alarm.
 */
export function staticSourceName(
  ts: typeof TsApi,
  verb: "getSignalSource" | "watermark",
  arg: TsApi.Expression | undefined,
  bindings: WorkflowBodyBindings,
): string | undefined {
  if (arg === undefined) return undefined;
  if (verb === "watermark") return ts.isStringLiteralLike(arg) ? arg.text : undefined;
  const exportName = resolveVerb(ts, arg, bindings);
  return exportName === null ? undefined : BUILTIN_SOURCE_NAMES.get(exportName);
}
