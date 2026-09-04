/** Durable workflow launch and the per-run resume controller. */

import {
  createWorkflowRunController,
  type LaunchWorkflowRecipeInput,
  type LaunchWorkflowRecipeResult,
  type WorkflowLaunchStatus,
} from "./t3team-workflowEngineLaunchTypes.ts";

export { createWorkflowRunController } from "./t3team-workflowEngineController.ts";
export type {
  LaunchWorkflowRecipeInput,
  LaunchWorkflowRecipeResult,
  WorkflowLaunchStatus,
} from "./t3team-workflowEngineLaunchTypes.ts";
export type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
export {
  awaitWorkflowRepairChildReply,
  remainingWorkflowRepairBudget,
} from "./t3team-workflowEngineRepair.ts";

/**
 * Launch a durable workflow run and settle its outcome. The per-run funnel
 * (running row, launch, the suspended/aborted/completed mapping, and the
 * bounded self-repair attempt) is the shared host-neutral
 * `createWorkflowRunController().start` — the t3team server supplies its
 * sinks and repair; this function only maps the outcome to the launch result.
 */
export async function launchWorkflowRecipe(
  input: LaunchWorkflowRecipeInput,
): Promise<LaunchWorkflowRecipeResult> {
  const controller = createWorkflowRunController(input);
  const status: WorkflowLaunchStatus = await controller.start();
  return { runId: input.runId, status };
}
