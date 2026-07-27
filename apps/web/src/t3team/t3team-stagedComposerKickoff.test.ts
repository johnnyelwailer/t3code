/**
 * What the composer's submit actually hands the workflow.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vite-plus/test";

import { buildT3TeamComposerKickoff } from "~/t3team/t3team-stagedComposerKickoff";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import { addDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";
import {
  buildWorkItemRewriteSelectedRecipe,
  WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
  WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
} from "~/t3team/workitem/t3team-workItemRewriteWorkflowLaunch";

const WORKSPACE_ROOT = "/tmp/project-alpha";
const RECIPE_PATH = `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`;
const NOTE = "Lead with the user impact.";
const COMPOSER_TEXT = "Keep it under 150 words.";

function stagedRewrite(bodies: ReadonlyArray<string> = [NOTE]): T3TeamStagedComposerAction {
  const selectedRecipe = buildWorkItemRewriteSelectedRecipe({
    issueIdOrKey: "PROJ-42",
    summary: "Camera resets on reload",
    currentBody: "Current text.",
    projectWorkspaceRoot: WORKSPACE_ROOT,
  });
  if (!selectedRecipe) throw new Error("expected a selected recipe");

  return {
    selectedRecipe,
    composerNoteParameter: WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
    commentsParameter: WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
    comments: bodies.reduce(
      (list, body) => addDiffComment(list, { blockId: "description", quote: "", body }),
      [] as ReturnType<typeof addDiffComment>,
    ),
  };
}

describe("buildT3TeamComposerKickoff with a staged rewrite", () => {
  it("keeps the notes and the composer's own text on separate workflow inputs", () => {
    const kickoff = buildT3TeamComposerKickoff({
      stagedAction: stagedRewrite(),
      composerText: COMPOSER_TEXT,
    });

    const parameters = kickoff.workflow?.parameters as Record<string, unknown>;
    expect(parameters[WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER]).toBe(COMPOSER_TEXT);
    expect(parameters[WORK_ITEM_REWRITE_COMMENTS_PARAMETER]).toEqual([
      { blockId: "description", quote: "", body: NOTE },
    ]);
    // The two channels must not bleed: the prompt text is the human's own message, the note is quoted
    // feedback, and the workflow's confirmation card renders them differently.
    expect(String(parameters[WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER])).not.toContain(NOTE);
    expect(JSON.stringify(parameters[WORK_ITEM_REWRITE_COMMENTS_PARAMETER])).not.toContain(
      COMPOSER_TEXT,
    );
    // Staged context (issue key, current body) survives the merge.
    expect(parameters).toMatchObject({ issueIdOrKey: "PROJ-42", currentBody: "Current text." });
  });

  it("carries the recipe paths the server derives the run's tool scope from", () => {
    const kickoff = buildT3TeamComposerKickoff({
      stagedAction: stagedRewrite(),
      composerText: "",
    });

    expect(kickoff.workflow?.recipeId).toBe("describe-rewrite");
    expect(kickoff.workflow?.recipePath).toBe(RECIPE_PATH);
    expect(kickoff.workflow?.workflowPath).toBe(`${RECIPE_PATH}/workflow.ts`);
    expect(kickoff.kickoffMessage.trim().length).toBeGreaterThan(0);
  });

  it("sends every staged note, not just the last one", () => {
    const kickoff = buildT3TeamComposerKickoff({
      stagedAction: stagedRewrite([NOTE, "Drop the changelog section."]),
      composerText: "",
    });

    const parameters = (kickoff.workflow?.parameters ?? {}) as Record<string, unknown>;
    const comments = parameters[WORK_ITEM_REWRITE_COMMENTS_PARAMETER] as ReadonlyArray<{
      body: string;
    }>;
    expect(comments.map((comment) => comment.body)).toEqual([NOTE, "Drop the changelog section."]);
  });

  it("omits an empty channel rather than passing a blank to the schema", () => {
    const withoutNote = buildT3TeamComposerKickoff({
      stagedAction: stagedRewrite([]),
      composerText: "   ",
    }).workflow?.parameters as Record<string, unknown>;

    expect(withoutNote).not.toHaveProperty(WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER);
    expect(withoutNote).not.toHaveProperty(WORK_ITEM_REWRITE_COMMENTS_PARAMETER);
  });

  it("falls back to a plain kickoff when nothing is preselected", () => {
    const kickoff = buildT3TeamComposerKickoff({ composerText: "just chatting" });

    expect(kickoff).toEqual({ kickoffMessage: "just chatting", kickoffPending: true });
  });
});
