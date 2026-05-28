import type { ThreadId } from "@t3tools/contracts";
import type * as Path from "effect/Path";

const RECIPE_WORKFLOW_STATE_DIR = ".t3work/recipe-workflows";

export function workflowRunRecipeRootPath(
  pathService: Path.Path,
  workspaceRoot: string,
  workflowRunId: string,
): string {
  return pathService.join(workspaceRoot, "runs", workflowRunId, "recipe");
}

export function workflowStatePathForRun(
  pathService: Path.Path,
  workspaceRoot: string,
  workflowRunId: string,
): string {
  return pathService.join(
    workflowRunRecipeRootPath(pathService, workspaceRoot, workflowRunId),
    "workflow-state.json",
  );
}

export function legacyWorkflowStatePath(
  pathService: Path.Path,
  workspaceRoot: string,
  threadId: ThreadId,
): string {
  return pathService.join(workspaceRoot, RECIPE_WORKFLOW_STATE_DIR, `${threadId}.json`);
}
