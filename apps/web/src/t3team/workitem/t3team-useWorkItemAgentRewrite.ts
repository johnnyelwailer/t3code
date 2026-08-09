/**
 * Controller for the description section's `Rewrite` control.
 *
 * Clicking it does NOT launch anything. It PRESELECTS the bundled `describe-rewrite` recipe workflow
 * on the work item's composer and opens an inline note popout — both pure client state, so the click
 * is instant: no request, no thread, no run, no model. The workflow starts when the human submits the
 * composer, which is also where their own prompt text joins in.
 *
 * That is a behaviour change, not a shortcut. The control used to create a thread and launch the run
 * on click, so the human waited through two round-trips before the workflow's `askUser` card let them
 * type anything — the intent was collected AFTER the machinery instead of before it.
 *
 * TWO CHANNELS, KEPT SEPARATE
 * Notes left in the popout become the workflow's `comments` input (quoted feedback, a list, each item
 * individually removable). The composer's own text becomes `instructions`. The popout never writes
 * into the composer's text box, because the workflow's confirmation card treats the two differently
 * and folding them together would lose which is which.
 *
 * WHY THERE IS NO BACKEND IN THIS HOOK
 * Deliberate: an input that cannot reach a server cannot spend a token. The invariant "no model turn
 * before the human has submitted their intent" is now structural rather than something the click path
 * has to be careful about. The launch lives with the composer — see
 * `t3team-stagedComposerActionLaunch` for the one place the two channels are merged into
 * `workflow.parameters`, and `buildBundledSidecarRecipeWorkflowLaunch` for the recipePath/workflowPath
 * guarantee the server derives the run's tool scope from.
 */

import { useCallback, useMemo, useState } from "react";

import type { T3TeamUserFacingError } from "~/t3team/components/error/t3team-errorMessage";
import {
  useT3TeamStagedComposerAction,
  useT3TeamStagedComposerActionStore,
} from "~/t3team/t3team-stagedComposerActionStore";
import { workItemRewriteMissingWorkspaceError } from "~/t3team/workitem/t3team-workItemRewriteLaunchErrors";
import {
  buildWorkItemRewriteSelectedRecipe,
  WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
  WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
} from "~/t3team/workitem/t3team-workItemRewriteWorkflowLaunch";
import {
  T3TEAM_WHOLE_DESCRIPTION_BLOCK_ID,
  T3TEAM_WHOLE_DESCRIPTION_QUOTE,
} from "~/t3team/workitem/t3team-workItemDiffCommentList";

export type UseWorkItemAgentRewriteInput = {
  readonly projectId: string;
  readonly ticketId: string;
  /** The issue key both the workflow input and the draft tool target — `model.key`, not the raw
   * ticket id. */
  readonly issueIdOrKey: string;
  /** Where `.t3team/recipes/describe-rewrite` lives. Without it there is no recipe to preselect. */
  readonly projectWorkspaceRoot?: string | undefined;
  readonly descriptionText?: string | undefined;
  readonly summary?: string | undefined;
  /** From `useWorkItemDrafts` — not re-derived here. */
  readonly hasPendingDescriptionDraft: boolean;
  /** Whether the work item's own data (ticket or snapshot) has actually loaded. A rewrite staged on
   * nothing — no description, no real summary — is worse than no control at all, so the caller gates
   * this rather than the control silently staging empty data. */
  readonly hasLoadedWorkItem: boolean;
};

export type UseWorkItemAgentRewriteResult = {
  readonly isComposing: boolean;
  /** Preselects the workflow on the composer and opens the note popout. Pure state. */
  readonly open: () => void;
  /** Closes the popout, and un-preselects when the human left no note behind. */
  readonly cancel: () => void;
  readonly submitComment: (body: string) => void;
  readonly stagedCommentCount: number;
  readonly isStaged: boolean;
  readonly error: T3TeamUserFacingError | null;
  readonly isDisabled: boolean;
};

export function useWorkItemAgentRewrite(
  input: UseWorkItemAgentRewriteInput,
): UseWorkItemAgentRewriteResult {
  const { projectId, ticketId, issueIdOrKey, hasPendingDescriptionDraft, hasLoadedWorkItem } = input;
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);

  const target = useMemo(() => ({ projectId, ticketId }), [projectId, ticketId]);
  const staged = useT3TeamStagedComposerAction(target);
  const stage = useT3TeamStagedComposerActionStore((state) => state.stage);
  const addComment = useT3TeamStagedComposerActionStore((state) => state.addComment);
  const clear = useT3TeamStagedComposerActionStore((state) => state.clear);

  const isDisabled = hasPendingDescriptionDraft || !hasLoadedWorkItem;

  const open = useCallback(() => {
    if (isDisabled) return;

    const selectedRecipe = buildWorkItemRewriteSelectedRecipe({
      issueIdOrKey,
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.descriptionText ? { currentBody: input.descriptionText } : {}),
      ...(input.projectWorkspaceRoot ? { projectWorkspaceRoot: input.projectWorkspaceRoot } : {}),
    });
    if (!selectedRecipe) {
      setError(workItemRewriteMissingWorkspaceError());
      return;
    }

    setError(null);
    // Re-staging is idempotent for the comment list: the store preserves whatever is already
    // attached, so re-opening to add a second note never replaces the first.
    stage(target, {
      selectedRecipe,
      composerNoteParameter: WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
      commentsParameter: WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
    });
    setIsComposing(true);
  }, [
    input.descriptionText,
    input.projectWorkspaceRoot,
    input.summary,
    isDisabled,
    issueIdOrKey,
    stage,
    target,
  ]);

  const stagedCommentCount = staged?.comments.length ?? 0;

  const cancel = useCallback(() => {
    setIsComposing(false);
    // A stray click must not leave the composer holding an action the human never asked for; a
    // click that produced notes must not throw them away.
    if (stagedCommentCount === 0) clear(target);
  }, [clear, stagedCommentCount, target]);

  const submitComment = useCallback(
    (body: string) => {
      addComment(target, {
        blockId: T3TEAM_WHOLE_DESCRIPTION_BLOCK_ID,
        quote: T3TEAM_WHOLE_DESCRIPTION_QUOTE,
        body,
      });
      setIsComposing(false);
    },
    [addComment, target],
  );

  return {
    isComposing,
    open,
    cancel,
    submitComment,
    stagedCommentCount,
    isStaged: staged !== undefined,
    error,
    isDisabled,
  };
}
