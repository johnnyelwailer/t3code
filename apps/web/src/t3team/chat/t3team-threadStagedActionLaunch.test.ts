/**
 * The other composer: a thread already exists, so the send launches the run here rather than handing
 * it to a kickoff. Same parameters, same recipe paths, still never a model turn.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { launchStagedComposerActionOnThread } from "~/t3team/chat/t3team-threadStagedActionLaunch";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import { addDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";
import {
  buildWorkItemRewriteSelectedRecipe,
  WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
  WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
} from "~/t3team/workitem/t3team-workItemRewriteWorkflowLaunch";

const WORKSPACE_ROOT = "/tmp/project-alpha";
const RECIPE_PATH = `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`;

function stagedRewrite(): T3TeamStagedComposerAction {
  const selectedRecipe = buildWorkItemRewriteSelectedRecipe({
    issueIdOrKey: "PROJ-42",
    projectWorkspaceRoot: WORKSPACE_ROOT,
  });
  if (!selectedRecipe) throw new Error("expected a selected recipe");
  return {
    selectedRecipe,
    composerNoteParameter: WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
    commentsParameter: WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
    comments: addDiffComment([], {
      blockId: "description",
      quote: "the description",
      body: "Lead with the user impact.",
    }),
  };
}

const MODEL_SELECTION = { instanceId: "instance-1", model: "test-model" } as never;

describe("launchStagedComposerActionOnThread", () => {
  it("launches the preselected workflow on the thread with both input channels", async () => {
    const launchRecipeWorkflow = vi.fn().mockResolvedValue({ ok: true });
    const dispatchCommand = vi.fn();

    const launched = await launchStagedComposerActionOnThread({
      backend: { launchRecipeWorkflow, dispatchCommand } as unknown as BackendApi,
      threadId: "thread-1",
      action: stagedRewrite(),
      composerText: "Keep it under 150 words.",
      modelSelection: MODEL_SELECTION,
      runtimeMode: "chat" as never,
      interactionMode: "default" as never,
    });

    expect(launched).toBe(true);
    // No turn: the run's own first step is the deterministic askUser.
    expect(dispatchCommand).not.toHaveBeenCalled();
    expect(launchRecipeWorkflow).toHaveBeenCalledTimes(1);

    const request = launchRecipeWorkflow.mock.calls[0]?.[0] as {
      threadId: string;
      kickoffMessage: string;
      modelSelection: { instanceId: string; model: string };
      launch: { recipePath: string; workflowPath: string; parameters: Record<string, unknown> };
    };
    expect(request.threadId).toBe("thread-1");
    expect(request.modelSelection).toEqual({ instanceId: "instance-1", model: "test-model" });
    expect(request.launch.recipePath).toBe(RECIPE_PATH);
    expect(request.launch.workflowPath).toBe(`${RECIPE_PATH}/workflow.ts`);
    expect(request.launch.parameters[WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER]).toBe(
      "Keep it under 150 words.",
    );
    expect(request.launch.parameters[WORK_ITEM_REWRITE_COMMENTS_PARAMETER]).toEqual([
      { blockId: "description", quote: "the description", body: "Lead with the user impact." },
    ]);
  });

  it("refuses a staged action with no workflow path rather than launching a toolless run", async () => {
    const launchRecipeWorkflow = vi.fn();
    const action = stagedRewrite();
    const { workflowPath: _dropped, ...workflowWithoutPath } =
      action.selectedRecipe.recipe.workflow!;

    const launched = await launchStagedComposerActionOnThread({
      backend: { launchRecipeWorkflow } as unknown as BackendApi,
      threadId: "thread-1",
      action: {
        ...action,
        selectedRecipe: {
          ...action.selectedRecipe,
          recipe: { ...action.selectedRecipe.recipe, workflow: workflowWithoutPath },
        },
      },
      composerText: "",
      modelSelection: MODEL_SELECTION,
      runtimeMode: "chat" as never,
      interactionMode: "default" as never,
    });

    expect(launched).toBe(false);
    expect(launchRecipeWorkflow).not.toHaveBeenCalled();
  });
});
