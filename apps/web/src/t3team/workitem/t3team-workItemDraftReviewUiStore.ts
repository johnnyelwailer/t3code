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
  /**
   * The issue whose description review the reader COLLAPSED.
   *
   * A pending description draft now renders expanded in place by default — it was three clicks deep
   * (banner → row → "Review in place") to read something the agent had already written, which read as
   * "nothing happened". So this tracks the collapse, not the open: absence means visible.
   */
  readonly collapsedDescriptionReviewForIssue: string | undefined;
  readonly openStrip: (issueIdOrKey: string, field?: string) => void;
  readonly closeStrip: () => void;
  readonly toggleStrip: (issueIdOrKey: string) => void;
  readonly openDescriptionReview: (issueIdOrKey: string) => void;
  readonly closeDescriptionReview: () => void;
  readonly collapseDescriptionReview: (issueIdOrKey: string) => void;
};

export const useWorkItemDraftReviewUiStore = create<WorkItemDraftReviewUiState>((set, get) => ({
  openStripForIssue: undefined,
  highlightField: undefined,
  reviewingDescriptionForIssue: undefined,
  collapsedDescriptionReviewForIssue: undefined,
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
    // Re-expands: the strip's "Review in place" must win over an earlier collapse.
    set({
      reviewingDescriptionForIssue: issueIdOrKey,
      collapsedDescriptionReviewForIssue: undefined,
    });
  },
  closeDescriptionReview: () => {
    set({ reviewingDescriptionForIssue: undefined });
  },
  collapseDescriptionReview: (issueIdOrKey) => {
    set({
      reviewingDescriptionForIssue: undefined,
      collapsedDescriptionReviewForIssue: issueIdOrKey,
    });
  },
}));
