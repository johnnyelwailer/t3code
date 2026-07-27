import { create } from "zustand";

/**
 * Ephemeral "what review surface is open" state — separate from `t3team-draftMutationStore.ts`,
 * which holds the drafts themselves. Global (not per-component) because the strip's entry points
 * (a field marker, the nav pill) and the strip itself are siblings scattered across the detail view,
 * not a subtree that could share plain React state without threading it through every layer.
 *
 * One strip, never two: opening it always targets one issue, so a second marker or pill click
 * re-highlights within the same panel rather than opening a second one.
 */
type WorkItemDraftReviewUiState = {
  readonly openStripForIssue: string | undefined;
  readonly highlightField: string | undefined;
  readonly reviewingDescriptionForIssue: string | undefined;
  readonly openStrip: (issueIdOrKey: string, field?: string) => void;
  readonly closeStrip: () => void;
  readonly toggleStrip: (issueIdOrKey: string) => void;
  readonly openDescriptionReview: (issueIdOrKey: string) => void;
  readonly closeDescriptionReview: () => void;
};

export const useWorkItemDraftReviewUiStore = create<WorkItemDraftReviewUiState>((set, get) => ({
  openStripForIssue: undefined,
  highlightField: undefined,
  reviewingDescriptionForIssue: undefined,
  openStrip: (issueIdOrKey, field) => {
    set({ openStripForIssue: issueIdOrKey, highlightField: field });
  },
  closeStrip: () => {
    set({ openStripForIssue: undefined, highlightField: undefined });
  },
  toggleStrip: (issueIdOrKey) => {
    const isOpenForThisIssue = get().openStripForIssue === issueIdOrKey;
    set({
      openStripForIssue: isOpenForThisIssue ? undefined : issueIdOrKey,
      highlightField: undefined,
    });
  },
  openDescriptionReview: (issueIdOrKey) => {
    set({ reviewingDescriptionForIssue: issueIdOrKey });
  },
  closeDescriptionReview: () => {
    set({ reviewingDescriptionForIssue: undefined });
  },
}));
