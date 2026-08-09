/**
 * "Take me to that proposal" — the completion card's click.
 *
 * Three things have to happen and the order matters: navigate to the work item, make sure its description
 * review is EXPANDED (the reader may have collapsed it earlier, and landing on a collapsed draft after
 * clicking "review the proposal" is the same dead end the card exists to fix), and scroll the description
 * section into view because on a long work item it is well below the fold.
 *
 * The scroll is deferred to a frame after navigation: the section only exists once the detail view has
 * rendered, so scrolling in the same tick finds nothing.
 */

import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { buildWorkItemSectionAnchors } from "~/t3team/workitem/t3team-workItemSectionAnchors";
import type { T3TeamWorkItemDraftRefOpenHandler } from "~/t3team/chat/t3team-WorkItemDraftRefCard";

export function scrollWorkItemDescriptionIntoView(issueIdOrKey: string): void {
  const anchorId = buildWorkItemSectionAnchors(issueIdOrKey).description;
  requestAnimationFrame(() => {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function useOpenT3TeamWorkItemDraft(): T3TeamWorkItemDraftRefOpenHandler {
  const navigate = useNavigate();
  const openDescriptionReview = useWorkItemDraftReviewUiStore(
    (state) => state.openDescriptionReview,
  );

  return useCallback(
    ({ projectId, issueIdOrKey }) => {
      // Clears any collapse for this issue, so the draft is open when the reader arrives.
      openDescriptionReview(issueIdOrKey);
      void navigate({
        to: "/t3team/projects/$projectId/tickets/$ticketId",
        params: { projectId, ticketId: issueIdOrKey },
      }).then(() => scrollWorkItemDescriptionIntoView(issueIdOrKey));
    },
    [navigate, openDescriptionReview],
  );
}
