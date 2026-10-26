import * as Effect from "effect/Effect";

import { AUTHORING_EXHAUSTED_STEP, AUTHORING_RECOVERY_HINT } from "./t3team-workflowAuthorDraft.ts";
import type { PreparedWorkflowLaunchDeps } from "./t3team-workflowEphemeralLaunchTypes.ts";
import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";

/** No execution continuation exists yet. Keep the existing durable paused state across restart. */
export const parkWorkflowAuthorDraft = Effect.fn("parkWorkflowAuthorDraft")(function* (ctx: {
  readonly launch: PreparedWorkflowLaunchDeps;
  readonly input: { readonly runId: string; readonly launchThreadId: string };
  readonly authorStepId: string;
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly hasDraft: boolean;
  readonly nowIso: () => string;
}) {
  const parked = yield* ctx.launch.runRepository.casClearPending({
    runId: ctx.input.runId,
    expectedStatuses: ["authoring"],
    status: "paused",
    updatedAt: ctx.nowIso(),
    failureStep: ctx.hasDraft ? AUTHORING_EXHAUSTED_STEP : `${AUTHORING_EXHAUSTED_STEP}.empty`,
    failureReason: "The author turn exhausted without a validated submission.",
  });
  if (!parked) return; // A racing Stop owns the row and its final presentation.
  yield* Effect.promise(() =>
    ctx.stepActivities.emitSent({
      correlationId: ctx.authorStepId,
      stepKind: "workflow.author",
      phase: "paused",
      detail: AUTHORING_RECOVERY_HINT,
    }),
  );
  yield* Effect.promise(() =>
    ctx.launch.host.syncRunFacts(ctx.input.launchThreadId).catch(() => {}),
  );
});
