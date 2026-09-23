/**
 * What the workflow-engine reactor does with a `thread.turn` ask whose turn ended WITHOUT an
 * answer — it died (`failed`) or said nothing (`empty`). Split out of
 * `t3team-workflowEngineReactorTasks.ts` (LOC ceiling); the rules are the interesting part:
 *
 *   • a LIVE (black-boxed composition) ask has no failure channel of its own: it settles with ""
 *     so the composition's own emptiness check fires;
 *   • a durable ask whose turn FAILED (the session died with `error`) gets the bounded re-drive
 *     whether it was set live or rehydrated — a dead provider is transient, and failing on the
 *     spot or parking forever is the overnight stall of GHE #403;
 *   • a durable ask whose turn was merely SILENT re-drives only when it was interrupted by a host
 *     restart (its pending carries the journaled `turnRetries` budget); a live step that says
 *     nothing is a body fault and still fails the run, as before.
 */

import * as Effect from "effect/Effect";

import type {
  T3TeamWorkflowEngineRegistryShape,
  WorkflowPendingAsk,
} from "./t3team-workflowEngineRegistry.ts";
import { NO_TEXT_MESSAGE, type InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import type { WorkflowTurnSettlement } from "./t3team-workflowTurnResolution.ts";

export type UnansweredTurnSettlement = Extract<
  WorkflowTurnSettlement,
  { kind: "empty" | "failed" }
>;

export const settleUnansweredTurn = Effect.fn("settleUnansweredTurn")(function* (
  deps: {
    readonly registry: T3TeamWorkflowEngineRegistryShape;
    readonly turnRetry: InterruptedTurnRetry;
  },
  input: {
    readonly threadId: string;
    readonly pending: WorkflowPendingAsk;
    readonly settlement: UnansweredTurnSettlement;
  },
) {
  const { threadId, pending, settlement } = input;
  if (settlement.kind === "failed") {
    yield* Effect.logWarning("t3team workflow agent turn failed", {
      threadId,
      correlationId: pending.correlationId,
      error: settlement.error,
    });
  } else {
    yield* Effect.logWarning("t3team workflow agent turn produced no reply text", {
      threadId,
      correlationId: pending.correlationId,
    });
  }
  if (pending.resolveLive !== undefined) {
    yield* Effect.promise(() => pending.resolveLive!(""));
    return;
  }
  const run = deps.registry.getRun(pending.runId);
  if (run === undefined) return;
  if (settlement.kind === "failed") {
    yield* deps.turnRetry.settleFailedTurn(threadId, pending, run, settlement.error);
    return;
  }
  if (pending.turnRetries !== undefined) {
    yield* deps.turnRetry.settleNoText(threadId, pending, run);
    return;
  }
  const error = new Error(NO_TEXT_MESSAGE);
  yield* Effect.promise(() =>
    run.fail === undefined ? run.resume(pending.correlationId, "") : run.fail(error),
  );
});
