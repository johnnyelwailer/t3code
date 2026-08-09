import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import { resumeWorkflow } from "@t3team/sdk";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3team-workflowEngineLaunch.ts";
import {
  coordinateWorkflowRepair,
  parseWorkflowRepairChildResult,
} from "./t3team-workflowSelfHeal.ts";
import { validateWorkflowRepairCandidate } from "./t3team-workflowRepairGuardrails.ts";
import { makeWorkflowRepairGenerator } from "./t3team-workflowRepairGenerate.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";

/** Race one hidden repair reply against its remaining shared deadline. */
export { awaitWorkflowRepairChildReply } from "./t3team-workflowRepairGenerate.ts";

export const remainingWorkflowRepairBudget = (deadlineMs: number, nowMs: number): number =>
  Math.max(0, deadlineMs - nowMs);

export const workflowRepairIsStopped = (
  input: Pick<LaunchWorkflowRecipeInput, "runId" | "registry">,
  controller: Pick<WorkflowRunController, "isCancelled">,
): boolean =>
  controller.isCancelled() ||
  input.registry.getRun(input.runId) === undefined ||
  workflowAdmissionQueue.isCancelled(input.runId);

/** Host-owned self-heal: child turn, candidate validation, replacement, and resume. */
export async function tryWorkflowRepair(
  input: LaunchWorkflowRecipeInput,
  controller: WorkflowRunController,
  error: unknown,
): Promise<boolean> {
  const stopped = (): boolean => workflowRepairIsStopped(input, controller);
  if (stopped()) return false;
  const maxAttempts = Math.max(0, Math.min(5, input.repairMaxAttempts ?? 3));
  if (input.repairIntent === undefined || maxAttempts === 0) return false;
  const repairModelSelection =
    input.repairModelSelection === "inherit" || input.repairModelSelection === undefined
      ? input.modelSelection
      : input.repairModelSelection;
  const priorReasons: string[] = [];
  const repairFailureReason = (error instanceof Error ? error.message : String(error))
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const deadline =
    (await Effect.runPromise(Clock.currentTimeMillis)) +
    Math.max(1_000, input.repairTotalTimeBudgetMs ?? 900_000);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (stopped()) return false;
    const timeoutMs = remainingWorkflowRepairBudget(
      deadline,
      await Effect.runPromise(Clock.currentTimeMillis),
    );
    if (timeoutMs <= 0) return false;
    const source = await input.readWorkflowSource?.().catch(() => null);
    if (source === null || source === undefined) return false;
    let repairChildId: string | undefined;
    const result = await coordinateWorkflowRepair({
      origin: "ephemeral",
      repairAttempts: attempt,
      maxAttempts,
      source,
      failure: error,
      intent: input.repairIntent,
      args: input.args,
      workspaceRoot: input.runsRoot,
      generateRepair: makeWorkflowRepairGenerator({
        input,
        stopped,
        priorReasons,
        repairModelSelection,
        attempt,
        timeoutMs,
        onRepairChildId: (childId) => {
          repairChildId = childId;
        },
      }),
      validateSource: (replacement, original) =>
        validateWorkflowRepairCandidate({
          originalSource: original,
          replacementSource: replacement,
          absolutePath: input.workflowPath,
        }),
      replaceSource: async (nextSource) => {
        if (stopped()) throw new Error("Workflow was stopped");
        if (input.replaceWorkflowSource === undefined)
          throw new Error("Workflow source replacement is unavailable.");
        await input.replaceWorkflowSource(nextSource);
      },
      resumeWorkflowAfterRepair: async () => {
        if (stopped()) return false;
        try {
          await controller.settle(
            await resumeWorkflow(input.runId, controller.ref, input.args, {
              ...controller.options,
              workflowVersionPolicy: "allow-change",
            }),
          );
          return true;
        } catch {
          return false;
        }
      },
      recordAudit: async (audit) =>
        input.recordRepairAudit?.({
          attempt: attempt + 1,
          originalError: audit.failure,
          outcome: audit.outcome,
          ...(audit.summary === undefined ? {} : { summary: audit.summary }),
          ...(audit.reason === undefined ? {} : { reason: audit.reason }),
        }),
      activity: async (phase, detail) => {
        // A successful settle unregisters the run before the coordinator publishes its final
        // recovery activity. Cancellation cannot reach this phase because resume returns false.
        if (phase !== "recovered" && stopped()) return;
        await controller.stepActivities.emitSent({
          correlationId: `${input.runId}:repair:${attempt + 1}:${phase}`,
          stepKind: "workflow.self-heal",
          phase: phase === "failed" ? "failed" : phase === "recovered" ? "completed" : "started",
          // This text is both the activity payload and the card-row label. Keep it authored by
          // the host: repair prompts, model ids, and runtime kinds must never become UI text.
          detail:
            phase === "analysing"
              ? "Analysing failure"
              : phase === "repairing"
                ? "Repairing workflow"
                : phase === "resuming"
                  ? "Resuming workflow"
                  : phase === "recovered"
                    ? "Workflow recovered"
                    : "Repair attempt failed",
          ...(phase === "failed" && detail !== undefined ? { error: detail } : {}),
          ...(phase === "analysing" && repairFailureReason.length > 0
            ? { error: repairFailureReason }
            : {}),
          ...(repairChildId === undefined ? {} : { threadId: repairChildId }),
        });
      },
    });
    if (result.kind === "recovered") return true;
    if (result.kind === "not-attempted") return false;
    priorReasons.push(result.reason.slice(0, 240));
  }
  return false;
}
