/** Durable workflow launch and the per-run resume controller. */
// @effect-diagnostics globalConsole:off -- onComplete sink failure log in a plain Promise path, outside any Effect runtime.

import { startWorkflow } from "@t3team/sdk";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import { makeControllerFail, makeControllerResume } from "./t3team-workflowEngineResume.ts";
import { deliverWorkflowCompletion } from "./t3team-workflowCompletionMessage.ts";
import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";
import type { WorkflowRepairIntent } from "./t3team-workflowSelfHeal.ts";
import { tryWorkflowRepair } from "./t3team-workflowEngineRepair.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";
import { t3teamWorkflowHostToolRunOptions } from "./t3team-workflowHostDraftTools.ts";

// Moved to the types module (LOC cap); re-exported so existing importers stay valid.
export type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
export {
  awaitWorkflowRepairChildReply,
  remainingWorkflowRepairBudget,
} from "./t3team-workflowEngineRepair.ts";

// Contract types live in the types module (LOC cap); re-exported so importers stay valid.
export type {
  LaunchWorkflowRecipeInput,
  LaunchWorkflowRecipeResult,
  WorkflowLaunchStatus,
  WorkflowRunController,
} from "./t3team-workflowEngineLaunchTypes.ts";

import type {
  LaunchWorkflowRecipeInput,
  LaunchWorkflowRecipeResult,
} from "./t3team-workflowEngineLaunchTypes.ts";

// The controller is its own module; re-exported so existing importers stay valid.
export { createWorkflowRunController } from "./t3team-workflowEngineController.ts";
import { createWorkflowRunController } from "./t3team-workflowEngineController.ts";

export async function launchWorkflowRecipe(
  input: LaunchWorkflowRecipeInput,
): Promise<LaunchWorkflowRecipeResult> {
  const controller = createWorkflowRunController(input);
  if (!input.lifecycleAlreadyRunning) await input.lifecycle?.recordRunning();

  try {
    const status = await controller.settle(
      await startWorkflow(controller.ref, input.args, {
        ...controller.options,
        runId: input.runId,
      }),
    );
    return { runId: input.runId, status };
  } catch (error) {
    if (controller.isCancelled()) return { runId: input.runId, status: "suspended" };
    const repaired = await tryWorkflowRepair(input, controller, error);
    if (repaired) return { runId: input.runId, status: "completed" };
    // Stop may arrive while the hidden repair child is active. Do not overwrite the durable
    // stopped state with a later failure or leave callers waiting for the repair deadline.
    if (controller.isCancelled()) return { runId: input.runId, status: "suspended" };
    // The run may have completed DURING repair (settle deletes it from the registry and posts
    // the completion) with only post-completion bookkeeping failing afterwards — a late error
    // must not overwrite the genuine completion notice with a failure.
    if (input.registry.getRun(input.runId) === undefined)
      return { runId: input.runId, status: "completed" };
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
      // Only an ephemeral, agent-authored run carries a repair intent, and only its reader owns the
      // source. A bundled or project recipe run was started by a human who cannot edit it.
      hostOwnsSource: input.repairIntent !== undefined,
    });
    return { runId: input.runId, status: "failed" };
  }
}
