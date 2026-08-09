/**
 * Whether the description section shows its proposed rewrite.
 *
 * A pending description draft is VISIBLE BY DEFAULT. It used to take three clicks to read something the
 * agent had already finished writing — a "1 proposed" banner, then a summary row, then "Review in place"
 * — which read as "nothing happened" to the person who had just asked for a rewrite. The draft is the
 * answer to their request; it should not be behind a disclosure.
 *
 * So the state tracked is the COLLAPSE, not the open: absence of a collapse means visible. The draft
 * strip keeps its job as a summary and as navigation for drafts on OTHER sections, and its
 * "Review in place" still works — it clears the collapse.
 *
 * `reviewingDescriptionForIssue` is still honoured on its own so the strip can open the review for an
 * issue whose draft has not landed in this component's store selector yet.
 */

import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";

export function useWorkItemDescriptionReviewOpen(issueIdOrKey: string): boolean {
  const drafts = useWorkItemDrafts({ issueIdOrKey });
  const explicitlyOpen = useWorkItemDraftReviewUiStore(
    (state) => state.reviewingDescriptionForIssue === issueIdOrKey,
  );
  const collapsed = useWorkItemDraftReviewUiStore(
    (state) => state.collapsedDescriptionReviewForIssue === issueIdOrKey,
  );

  if (drafts.description === undefined) {
    return explicitlyOpen;
  }
  return !collapsed;
}
