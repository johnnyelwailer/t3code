/**
 * Classification for the SDK's composition/scheduling primitives — `workflow()`, `wait()`,
 * `waitUntil()` — split out of `t3team-sdk.workflowShapeScan.ts` to keep that module under the
 * additive-guard LOC ceiling. None of these fit the four-kind vocabulary's other three buckets
 * (`read`/`agent`/`ask`); all three classify as `act`, a unit of work that runs and mutates.
 *
 * Before this existed, a real call site for any of these silently vanished from the preview (see
 * `classifyCall`'s `if (verb !== null) return;` fallthrough) — the shipped `review-pipeline`
 * recipe rendered 4 of its 6 phases empty because every phase's only content was a `workflow()`
 * call, and a `wait.until` runtime step had no plan row to bind to at all.
 */
import type * as TsApi from "typescript";

import type { WorkflowStepKind } from "./t3team-sdk.workflowShape.ts";

/**
 * The child module's basename when `node` is `defineWorkflow(...)`'s call site inline — the
 * common author pattern: `workflow(defineWorkflow<T>("./orchestrations/scope.ts"), args)`. Only a
 * plain string literal path is resolved; a ref bound to a variable earlier in the body, or a
 * template-literal path, is not — that would need value-tracking beyond this scan's scope, so it
 * falls back to the generic label in `classifyCompositionVerb` rather than guessing.
 */
function workflowRefLabel(
  ts: typeof TsApi,
  node: TsApi.Node | undefined,
  sf: TsApi.SourceFile,
): string | null {
  if (node === undefined || !ts.isCallExpression(node)) return null;
  const callee = node.expression;
  const calleeName = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (calleeName !== "defineWorkflow") return null;
  const pathArg = node.arguments[0];
  if (pathArg === undefined || !ts.isStringLiteralLike(pathArg)) return null;
  const basename = pathArg.text.split("/").at(-1);
  return basename !== undefined && basename.length > 0 ? basename : pathArg.text;
}

/** Classifies `workflow()`/`wait()`/`waitUntil()`; returns false when `verb` is none of them. */
export function classifyCompositionVerb(
  ts: typeof TsApi,
  verb: string,
  arg0: TsApi.Node | undefined,
  sf: TsApi.SourceFile,
  onStep: (kind: WorkflowStepKind, label: string) => void,
): boolean {
  if (verb === "workflow") {
    onStep("act", workflowRefLabel(ts, arg0, sf) ?? "Run sub-workflow");
    return true;
  }
  // `wait`/`waitUntil` take no options object to read a label from, and the real deadline is a
  // runtime value this static scan cannot know (usually computed from `now() + …`), so the label
  // stays generic. The text matters: the client's `stepMatchesPlan` already looks for
  // `/\b(wait|schedule|pause|delay)\b/i` to bind a `wait.until` runtime step to a plan row.
  if (verb === "wait") {
    onStep("act", "Pause");
    return true;
  }
  if (verb === "waitUntil") {
    onStep("act", "Wait for scheduled time");
    return true;
  }
  return false;
}
