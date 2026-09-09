/**
 * Builds a run's t3team controller: its host-neutral funnel
 * (`createWorkflowRunHost` from `@t3team/sdk`) plus the t3team-specific
 * pieces wired around it — the dispatch-based broker and run options
 * (`t3team-workflowEngineControllerEnv.ts`), the step-activity UX sinks,
 * the agent self-repair funnel, and the terminal-failure sequence.
 *
 * This module builds the controller WITHOUT starting it. It has two callers
 * with opposite starting points — `launchWorkflowRecipe` (which then calls
 * `start`) and boot rehydration (which restores the pending ask instead) —
 * and a fresh and a restored run must drive forward through identical code.
 * Depends only downward, never back on the launch module.
 */
// @effect-diagnostics globalConsole:off -- onComplete sink failure log in a plain Promise path, outside any Effect runtime.

import { createWorkflowRunHost } from "@t3team/sdk";

import { summarizeCompositionBranchFailures } from "./t3team-workflowEngineCompositionFailure.ts";
import { createWorkflowRunControllerEnv } from "./t3team-workflowEngineControllerEnv.ts";
import { deliverWorkflowCompletion } from "./t3team-workflowCompletionMessage.ts";
import { tryWorkflowRepair } from "./t3team-workflowEngineRepair.ts";
import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";

// Moved to the types module (LOC cap); re-exported so existing importers stay valid.
export type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3team-workflowEngineLaunchTypes.ts";

export function createWorkflowRunController(
  input: LaunchWorkflowRecipeInput,
): WorkflowRunController {
  const { ref, options, stepActivities, compositionBranchFailures } =
    createWorkflowRunControllerEnv(input);

  // The per-run funnel itself — start/settle/resume/fail/cancel — is the shared, host-neutral
  // SDK host. This controller supplies its t3team sinks and the optional agent self-repair.
  const host = createWorkflowRunHost({
    ref,
    args: input.args,
    runId: input.runId,
    runOptions: options,
    registry: input.registry,
    ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
    sinks: {
      onCompleted: async (result) => {
        // The run itself completed — `parallel`/`pipeline` never rethrow a branch's rejection —
        // but a failed branch must keep this from reading as unqualifiedly green. `phase` stays
        // "completed" (that is the truth); `error` carries a summary a viewer sees the same way
        // as any other run-level note (the branch's own "failed" step row is the primary signal).
        await stepActivities.emitRun(
          "completed",
          summarizeCompositionBranchFailures([...compositionBranchFailures]),
        );
        await deliverWorkflowCompletion({
          launchThreadId: input.launchThreadId,
          workflowRunId: input.runId,
          output: result.result,
          projectId: input.projectId,
          dispatch: input.dispatch,
          newId: input.newId,
          nowIso: input.nowIso,
        });
        // A throwing output sink must not flip the run to "failed" after the completion
        // message already posted (double-notify).
        try {
          await input.onComplete?.(result.result);
        } catch (sinkError) {
          console.warn(`[t3team-workflow] onComplete sink failed for run ${input.runId}:`, sinkError);
        }
      },
      onFailed: async ({ phase, error }) => {
        await settleWorkflowRunFailure({
          runId: input.runId,
          launchThreadId: input.launchThreadId,
          error,
          registry: input.registry,
          lifecycle: input.lifecycle,
          stepActivities,
          dispatch: input.dispatch,
          newId: input.newId,
          nowIso: input.nowIso,
          onError: input.onError,
          phase: phase === "host" ? "resume" : phase,
          // Host-side fail (a step that can never be answered): the row KEEPS its pending ask so
          // `t3team.orchestration.resume` re-drives exactly that step rather than replaying into a
          // `sent` entry nobody settles (GHE #403).
          ...(phase === "host" ? { retainPendingStep: true } : {}),
        });
      },
      onAborted: async ({ reason }) => {
        await stepActivities.emitRun("failed", reason);
      },
    },
    // The awaited primitive resolved — flip its live step activity to `completed` (same id →
    // in-place upsert) before the replay drives to the next suspension.
    onReplyJournaled: async (correlationId) => {
      await stepActivities.emitResolved(correlationId, "completed");
    },
    repair: () => (error) =>
      tryWorkflowRepair(
        input,
        {
          ref,
          options,
          start: host.start,
          settle: host.settle,
          resume: host.resume,
          stepActivities,
          isCancelled: host.isCancelled,
        },
        error,
      ),
    ...(input.lifecycleAlreadyRunning === undefined
      ? {}
      : { lifecycleAlreadyRunning: input.lifecycleAlreadyRunning }),
  });

  return {
    ref,
    options,
    start: host.start,
    settle: host.settle,
    resume: host.resume,
    stepActivities,
    isCancelled: host.isCancelled,
  };
}
