/**
 * Launch shape for the description section's `Rewrite` control: the bundled `describe-rewrite`
 * recipe workflow, never a direct agent turn.
 *
 * The workflow opens with a deterministic `thread.askUser` card, so nothing costs model tokens
 * until the human has said what should change; the writer turn and the draft-tool call happen
 * inside the workflow body (`apps/server/src/t3team-projectSetupDescriptionRewriteRecipe.ts`).
 *
 * `recipePath` is not decoration. The launch route derives the run's host-tool scope from the
 * recipe manifest and FAILS CLOSED, so a launch without it produces a run whose
 * `t3team.work_item.description.draft_update` call cannot resolve — the workflow would reach the
 * end and propose nothing. `buildBundledSidecarRecipeWorkflowLaunch` is the one builder that puts
 * `recipePath`/`workflowPath` on a bundled launch, so this reuses it rather than assembling a
 * second launch shape that could drift out of that guarantee.
 */

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { launchRecipeWorkflowOnThread } from "~/t3team/chat/t3team-launchRecipeWorkflowOnThread";
import { T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID } from "~/t3team/t3team-bundledRecipeWorkflowIds";
import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import {
  buildBundledSidecarRecipeWorkflowLaunch,
  type BundledRecipeWorkflow,
} from "~/t3team/t3team-sidecarRecipeLaunch";

const REWRITE_SURFACE = "workitem.detail.sidepanel" as const;

/** The workflow inputs the composer's two channels land on. The composer's own prompt text is the
 * human's free-form intent; the staged notes are quoted feedback. Separate inputs, separate meaning
 * — the workflow's confirmation card renders them differently. */
export const WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER = "instructions";
export const WORK_ITEM_REWRITE_COMMENTS_PARAMETER = "comments";

export type WorkItemRewriteWorkflowInput = {
  /** The key the workflow's `issueIdOrKey` input and the draft tool both target. */
  readonly issueIdOrKey: string;
  readonly summary?: string | undefined;
  readonly currentBody?: string | undefined;
  /** `.t3team/recipes/<id>` is resolved under this; without it there is nothing to launch. */
  readonly projectWorkspaceRoot?: string | undefined;
};

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** The workflow's `Inputs` struct, minus the optional fields this surface has nothing for — an
 * empty string is not "no summary" to a schema, so blanks are dropped rather than passed on. */
export function buildWorkItemRewriteParameters(
  input: WorkItemRewriteWorkflowInput,
): Record<string, unknown> {
  const summary = trimmedOrUndefined(input.summary);
  const currentBody = trimmedOrUndefined(input.currentBody);
  return {
    issueIdOrKey: input.issueIdOrKey,
    ...(summary ? { summary } : {}),
    ...(currentBody ? { currentBody } : {}),
  };
}

/** `null` when the project has no local workspace — the recipe lives on disk, so there is no
 * honest launch to make and the caller must surface that rather than launch a toolless run. */
export function buildWorkItemRewriteWorkflow(
  input: WorkItemRewriteWorkflowInput,
): BundledRecipeWorkflow | null {
  return buildBundledSidecarRecipeWorkflowLaunch({
    recipeId: T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID,
    surface: REWRITE_SURFACE,
    ...(input.projectWorkspaceRoot ? { projectWorkspaceRoot: input.projectWorkspaceRoot } : {}),
    parameters: buildWorkItemRewriteParameters(input),
  });
}

/**
 * The rewrite packaged as the composer's PRESELECTED action.
 *
 * This is the same `{recipe, customization}` value the Quick Starts card stages and the composer
 * already renders as its "Selected action" card, so the `Rewrite` control gets the existing
 * preselect-then-submit behaviour instead of a second launch path. `instructions`/`comments` are
 * deliberately absent here: they are submit-time inputs, merged by
 * `resolveStagedComposerActionRecipe` once the human actually sends.
 */
export function buildWorkItemRewriteSelectedRecipe(
  input: WorkItemRewriteWorkflowInput,
): T3TeamSelectedRecipeQuickStart | null {
  const workflow = buildWorkItemRewriteWorkflow(input);
  if (!workflow) {
    return null;
  }

  return {
    recipe: {
      id: T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID,
      title: workflow.title,
      description: workflow.description,
      // Becomes the thread's opening human message via `buildT3TeamSelectedRecipeKickoffLaunch`.
      prompt: buildWorkItemRewriteKickoffMessage(input.issueIdOrKey),
      composerGuidance: {
        helperText: "Add notes on the description, or send to start the rewrite.",
        placeholder: "Anything else the rewrite should take into account (optional)",
      },
      workflow,
    },
  };
}

/**
 * The message a freshly kicked-off rewrite thread opens with.
 *
 * On the kickoff path this is handed to `runThreadBootstrapKickoff`, which — because the kickoff
 * carries a `workflowPath` — routes it to `launchRecipeWorkflow` instead of `thread.turn.start`.
 * It is therefore never sent to a model; it exists so the thread reads as something a human asked
 * for. It must stay non-empty: the bootstrap only plans a `kickoff` when there is an initial
 * message, and an empty one would leave the thread created but never launched.
 */
export function buildWorkItemRewriteKickoffMessage(issueIdOrKey: string): string {
  return `Rewrite the description of ${issueIdOrKey} and propose it as a reviewable draft.`;
}

/**
 * Launches the workflow on a thread that already exists, from a `T3TeamKickoffLaunchConfig`.
 *
 * A thin adapter over `launchRecipeWorkflowOnThread` — the composer reaches that directly with its own
 * model/runtime picks, and one implementation means the two callers cannot disagree about what a
 * launch on an existing thread looks like.
 */
export async function launchWorkItemRewriteOnThread(input: {
  readonly backend: Pick<BackendApi, "launchRecipeWorkflow">;
  readonly threadId: string;
  readonly workflow: BundledRecipeWorkflow;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly kickoffMessage: string;
}): Promise<void> {
  await launchRecipeWorkflowOnThread({
    backend: input.backend,
    threadId: input.threadId,
    workflow: input.workflow,
    kickoffMessage: input.kickoffMessage,
    modelSelection: input.launchConfig.selection,
    runtimeMode: input.launchConfig.runtimeMode,
    interactionMode: input.launchConfig.interactionMode,
  });
}
