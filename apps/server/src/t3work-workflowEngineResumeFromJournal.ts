/**
 * Re-drive a parked (paused/failed) durable run from its journal — the machinery behind the
 * `t3work.workflow.resume` broker tool. This is surfacing, not rebuilding: it reuses the same
 * per-run controller the live launch and boot rehydration share
 * ({@link createWorkflowRunController}) and the SDK's `resumeWorkflow` same-prefix replay —
 * journaled entries return their recorded results verbatim; execution goes live past the
 * recorded frontier (a corrected source that diverges INSIDE the prefix fails loudly with
 * `ReplayDriftError`, exactly like any other resume).
 *
 * Unlike `launchWorkflowRecipe` there is no hidden repair funnel here: the caller (typically
 * the agent) supplies the corrected source explicitly, so a resume failure settles through
 * the one terminal-failure sequence and reports back.
 */

import { resumeWorkflow } from "@t3work/sdk";

import {
  createWorkflowRunController,
  type LaunchWorkflowRecipeInput,
  type LaunchWorkflowRecipeResult,
} from "./t3work-workflowEngineLaunch.ts";
import { settleWorkflowRunFailure } from "./t3work-workflowRunFailure.ts";

export async function resumeWorkflowRunFromJournal(
  input: LaunchWorkflowRecipeInput,
): Promise<LaunchWorkflowRecipeResult> {
  const controller = createWorkflowRunController(input);
  // Claim capacity/state (flips the durable row back to `running`); a Stop/Pause that wins
  // the race leaves the run parked instead of double-driving it.
  if ((await input.lifecycle?.recordActive()) === false) {
    return { runId: input.runId, status: "suspended" };
  }
  try {
    const status = await controller.settle(
      await resumeWorkflow(input.runId, controller.ref, input.args, controller.options),
    );
    return { runId: input.runId, status };
  } catch (error) {
    if (controller.isCancelled()) return { runId: input.runId, status: "suspended" };
    // Completed during settle with only bookkeeping failing after — never overwrite it.
    if (input.registry.getRun(input.runId) === undefined) {
      return { runId: input.runId, status: "completed" };
    }
    await settleWorkflowRunFailure({
      runId: input.runId,
      launchThreadId: input.launchThreadId,
      error,
      registry: input.registry,
      lifecycle: input.lifecycle,
      stepActivities: controller.stepActivities,
      dispatch: input.dispatch,
      newId: input.newId,
      nowIso: input.nowIso,
      onError: input.onError,
    });
    return { runId: input.runId, status: "failed" };
  }
}
