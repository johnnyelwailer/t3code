/**
 * The ONE terminal-failure sequence for a workflow run. Every failure funnel —
 * live launch catch, resume catch, boot rehydration of interrupted rows, and
 * orphaned sleeping runs — must end a run through here (or at minimum through
 * {@link deliverWorkflowFailure}) so the launching conversation is always told.
 * Bolting the notification onto individual catch blocks is how the
 * "agent hallucinates the run is still going" bug happened the first time.
 */

import type { OrchestrationCommand } from "@t3tools/contracts";

import { deliverWorkflowFailure } from "./t3work-workflowCompletionMessage.ts";
import type { WorkflowRunLifecycle } from "./t3work-workflowEngineBrokerTypes.ts";
import type { T3workWorkflowEngineRegistryShape } from "./t3work-workflowEngineRegistry.ts";
import type { WorkflowStepActivityEmitter } from "./t3work-workflowEngineStepActivities.ts";

export async function settleWorkflowRunFailure(input: {
  readonly runId: string;
  readonly launchThreadId: string | undefined;
  readonly error: unknown;
  readonly registry: T3workWorkflowEngineRegistryShape;
  readonly lifecycle: WorkflowRunLifecycle | undefined;
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
  readonly onError: ((error: unknown) => Promise<void>) | undefined;
}): Promise<void> {
  input.registry.deleteRun(input.runId);
  await input.lifecycle?.recordFailed();
  const errorText = input.error instanceof Error ? input.error.message : String(input.error);
  await input.stepActivities.emitRun("failed", errorText);
  await deliverWorkflowFailure({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.runId,
    errorText,
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
  await input.onError?.(input.error);
}
