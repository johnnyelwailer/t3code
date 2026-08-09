/**
 * The workflow action a work item's composer currently has PRESELECTED, plus the comments staged
 * alongside it.
 *
 * Why a store rather than props: the thing that stages the action (the Description section's
 * `Rewrite` control) lives in the content column, and the composer that runs it lives in the aside.
 * They are siblings with the whole detail layout in between, and the aside swaps between a kickoff
 * composer and an embedded thread composer. This is the same shape — and the same key — the existing
 * `pendingByKickoffKey` queue uses to get "Add to chat" context from the content column onto that
 * composer; staging an action is the same journey with a different payload.
 *
 * What it deliberately is NOT: a second launch path. The value it holds is a
 * `T3TeamSelectedRecipeQuickStart` — the exact type the Quick Starts card already stages and the
 * composer already renders as its "Selected action" card — so both composers reach the one existing
 * launch builder. Staging is pure client state: no network, no thread, no model.
 *
 * `stage` PRESERVES comments. Re-staging happens every time the human adds a note, and dropping the
 * earlier ones would make the second comment silently replace the first.
 */

import { create } from "zustand";

import { buildKickoffQueueKey, deleteRecordEntry } from "~/t3team/t3team-addToChatStoreHelpers";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import {
  addDiffComment,
  removeDiffComment,
  type T3TeamDiffComment,
  type T3TeamDiffCommentInput,
} from "~/t3team/workitem/t3team-workItemDiffCommentList";

export type T3TeamStagedComposerAction = {
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  /** Which workflow input the composer's own prompt text becomes. Kept as a name rather than a
   * hardcoded field so this store stays ignorant of any one recipe's schema. */
  readonly composerNoteParameter?: string | undefined;
  /** Which workflow input the staged comments become. */
  readonly commentsParameter?: string | undefined;
  readonly comments: ReadonlyArray<T3TeamDiffComment>;
};

export type T3TeamStagedComposerActionTarget = {
  readonly projectId: string;
  readonly ticketId: string;
};

type StagedComposerActionState = {
  readonly byKey: Record<string, T3TeamStagedComposerAction>;
  readonly stage: (
    target: T3TeamStagedComposerActionTarget,
    action: Omit<T3TeamStagedComposerAction, "comments">,
  ) => void;
  readonly addComment: (
    target: T3TeamStagedComposerActionTarget,
    input: T3TeamDiffCommentInput,
  ) => void;
  readonly removeComment: (target: T3TeamStagedComposerActionTarget, commentId: string) => void;
  readonly clear: (target: T3TeamStagedComposerActionTarget) => void;
};

function keyFor(target: T3TeamStagedComposerActionTarget): string {
  return buildKickoffQueueKey(target.projectId, target.ticketId);
}

export const useT3TeamStagedComposerActionStore = create<StagedComposerActionState>((set) => ({
  byKey: {},
  stage: (target, action) => {
    const key = keyFor(target);
    set((state) => ({
      byKey: { ...state.byKey, [key]: { ...action, comments: state.byKey[key]?.comments ?? [] } },
    }));
  },
  addComment: (target, input) => {
    const key = keyFor(target);
    set((state) => {
      const current = state.byKey[key];
      if (!current) return state;
      const comments = addDiffComment(current.comments, input);
      if (comments === current.comments) return state;
      return { byKey: { ...state.byKey, [key]: { ...current, comments } } };
    });
  },
  removeComment: (target, commentId) => {
    const key = keyFor(target);
    set((state) => {
      const current = state.byKey[key];
      if (!current) return state;
      return {
        byKey: {
          ...state.byKey,
          [key]: { ...current, comments: removeDiffComment(current.comments, commentId) },
        },
      };
    });
  },
  clear: (target) => {
    const key = keyFor(target);
    set((state) => (state.byKey[key] ? { byKey: deleteRecordEntry(state.byKey, key) } : state));
  },
}));

/** Subscribe from a composer surface. `undefined` means nothing is preselected. */
export function useT3TeamStagedComposerAction(
  target: T3TeamStagedComposerActionTarget | undefined,
): T3TeamStagedComposerAction | undefined {
  return useT3TeamStagedComposerActionStore((state) =>
    target ? state.byKey[keyFor(target)] : undefined,
  );
}
