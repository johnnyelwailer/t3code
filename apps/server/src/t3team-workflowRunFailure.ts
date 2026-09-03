/**
 * The ONE terminal-failure sequence for a workflow run. Every failure funnel —
 * live launch catch, resume catch, boot rehydration of interrupted rows, and
 * orphaned sleeping runs — must end a run through here (or at minimum through
 * {@link deliverWorkflowFailure}) so the launching conversation is always told.
 * Bolting the notification onto individual catch blocks is how the
 * "agent hallucinates the run is still going" bug happened the first time.
 */

import type { OrchestrationCommand } from "@t3tools/contracts";

import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import {
  workflowFailureReasonText,
  workflowFailureStepText,
  type WorkflowFailurePhase,
} from "./t3team-workflowFailureReason.ts";
import type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";

export async function settleWorkflowRunFailure(input: {
  readonly runId: string;
  readonly launchThreadId: string | undefined;
  readonly error: unknown;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly lifecycle: WorkflowRunLifecycle | undefined;
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
  readonly onError: ((error: unknown) => Promise<void>) | undefined;
  /** Which funnel is settling — the coarse half of the persisted failing-step label. */
  readonly phase?: WorkflowFailurePhase;
  /** `true` for an agent-authored ephemeral run, whose reader owns the source and can re-author it.
   * Omitted by funnels that cannot tell, which keeps the agent-authored wording. */
  readonly hostOwnsSource?: boolean;
  /** `true` when the failure is the HOST's verdict on an unanswered ask (a turn that died or said
   * nothing — see `WorkflowRegisteredRun.fail`): the durable row keeps its pending ask so
   * `t3team.orchestration.resume` can re-drive that step (GHE #403). A thrown body error clears it. */
  readonly retainPendingStep?: boolean;
}): Promise<void> {
  input.registry.deleteRun(input.runId);
  // Captured BEFORE deleteRun's siblings can churn: the primitive in flight is the step label.
  const detail = {
    reason: workflowFailureReasonText(input.error),
    step: workflowFailureStepText(
      input.phase ?? "launch",
      input.stepActivities.describePendingStep?.(),
    ),
    ...(input.retainPendingStep === true ? { retainPending: true } : {}),
  };
  await input.lifecycle?.recordFailed(detail);
  const errorText = input.error instanceof Error ? input.error.message : String(input.error);
  await input.stepActivities.emitRun("failed", errorText);
  await deliverWorkflowFailure({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.runId,
    errorText,
    ...(input.hostOwnsSource !== undefined ? { hostOwnsSource: input.hostOwnsSource } : {}),
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
  await input.onError?.(input.error);
}
