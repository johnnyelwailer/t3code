import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { draftContentToComparableText } from "~/t3team/t3team-draftMutationDiff";
import {
  selectJiraDocumentDrafts,
  useT3TeamDraftMutationStore,
} from "~/t3team/t3team-draftMutationStore";
import { deliverDraftFeedbackToSourceThread } from "~/t3team/workitem/t3team-deliverDraftFeedbackToSourceThread";
import { recordDraftCarrierOutcome } from "~/t3team/workitem/t3team-recordDraftCarrierOutcome";
import { useWorkItemDraftActionAccept } from "~/t3team/workitem/t3team-useWorkItemDraftActionAccept";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { T3TeamDiffSelectionComposer } from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";
import { useWorkItemDiffComments } from "~/t3team/workitem/t3team-useWorkItemDiffComments";
import { WorkItemDescriptionDiffBlock } from "~/t3team/workitem/t3team-WorkItemDescriptionDiffBlock";
import { WorkItemDescriptionDraftDiffHeader } from "~/t3team/workitem/t3team-WorkItemDescriptionDraftDiffHeader";
import {
  buildDraftDiffParagraphs,
  draftDiffMagnitude,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";

/** Accept needs a connected Atlassian account to write through. */
const APPLY_UNAVAILABLE_REASON = "Connect the Atlassian account for this project to apply drafts.";

export function shouldDisableDescriptionAccept(input: {
  readonly canApply: boolean;
  readonly pendingCommentCount: number;
}): boolean {
  return !input.canApply || input.pendingCommentCount > 0;
}

/**
 * The in-place review "Review in place" opens: the proposed description, diffed against the current
 * one, right where the description lives — not a side-by-side panel elsewhere. Reuses the real diff
 * primitives (`T3TeamDiffGutter`/`T3TeamDiffText`/selection composer/comment thread) against a plain
 * word-level diff computed from the draft's own text, since an ADF-aware block diff is a slice of its
 * own (see `t3team-workItemDescriptionDiffModel.ts`).
 */
export function WorkItemDescriptionDraftDiff({
  issueIdOrKey,
  projectId,
  accountId,
  currentText,
  onReload,
}: {
  readonly issueIdOrKey: string;
  readonly projectId: string;
  /** Without a connected account there is nothing to write through, so Accept stays disabled. */
  readonly accountId?: string | undefined;
  readonly currentText?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drafts = useT3TeamDraftMutationStore(
    useShallow(selectJiraDocumentDrafts({ projectId, issueIdOrKey })),
  );
  const draft = drafts.find((candidate) => candidate.field === "description");
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const returnDraftWithFeedback = useT3TeamDraftMutationStore(
    (state) => state.returnDraftWithFeedback,
  );
  const closeDescriptionReview = useWorkItemDraftReviewUiStore(
    (state) => state.closeDescriptionReview,
  );
  const collapseDescriptionReview = useWorkItemDraftReviewUiStore(
    (state) => state.collapseDescriptionReview,
  );
  const comments = useWorkItemDiffComments();
  const backend = useBackend();
  const acceptAction = useWorkItemDraftActionAccept();

  if (!draft) return null; // Accepted/dismissed elsewhere while this was open.

  // The draft's proposed body may be HTML (an older capture path) or markdown/plain — comparable text
  // either way, so an HTML draft doesn't leak raw tags into the word diff.
  const paragraphs = buildDraftDiffParagraphs(
    currentText,
    draftContentToComparableText(draft.proposedContent),
  );
  const { added, removed } = draftDiffMagnitude(paragraphs);
  const atlassian = backend?.atlassian;
  const acceptDisabled = shouldDisableDescriptionAccept({
    canApply: Boolean(atlassian) && Boolean(accountId),
    pendingCommentCount: comments.total,
  });

  /**
   * The fourth sibling of the scalar accepts: the same `applying → applied/error` lifecycle, the same
   * user-facing error surface. The proposed body is sent AS MARKDOWN — the server runs the same
   * markdown→ADF converter comments use, so pre-rendering it here would write a lossy projection to Jira.
   */
  function accept() {
    if (!atlassian || !accountId || !draft) return;
    acceptAction(draft, async () => {
      await atlassian.updateIssueDescription({
        accountId,
        issueIdOrKey: draft.target.issueIdOrKey,
        description: draftContentToComparableText(draft.proposedContent),
      });
      // Jira has the new body; record the outcome so a reload cannot re-offer it (see the seam's note).
      await recordDraftCarrierOutcome({ backend, draft, outcome: "applied" });
      onReload?.();
    });
  }

  function sendBack() {
    const feedback = comments.comments
      .map((comment) => `> ${comment.quote}\n${comment.body}`)
      .join("\n\n");
    returnDraftWithFeedback(draft!.id, feedback);
    void deliverDraftFeedbackToSourceThread({
      backend,
      sourceThreadId: draft!.sourceThreadId,
      draftId: draft!.id,
      issueIdOrKey: draft!.target.issueIdOrKey,
      field: draft!.field,
      feedback,
    });
    closeDescriptionReview();
  }

  return (
    <div ref={containerRef} className="relative rounded-lg border border-border bg-background">
      <WorkItemDescriptionDraftDiffHeader
        added={added}
        removed={removed}
        commentCount={comments.total}
        acceptDisabled={acceptDisabled}
        {...(acceptDisabled && comments.total === 0
          ? { acceptReason: APPLY_UNAVAILABLE_REASON }
          : {})}
        onSendBack={sendBack}
        onDismiss={() => {
          discardDraft(draft.id);
          void recordDraftCarrierOutcome({ backend, draft, outcome: "dismissed" });
          closeDescriptionReview();
        }}
        onAccept={accept}
        onCollapse={() => collapseDescriptionReview(issueIdOrKey)}
      />

      <T3TeamDiffSelectionComposer containerRef={containerRef} onSubmit={comments.add} />

      <div className="space-y-2.5 px-3 py-3 text-sm leading-6 text-foreground">
        {paragraphs.map((paragraph) => (
          <WorkItemDescriptionDiffBlock
            key={paragraph.id}
            paragraph={paragraph}
            comments={comments.forBlock(paragraph.id)}
            quotes={comments.quotesForBlock(paragraph.id)}
            onRemoveComment={comments.remove}
          />
        ))}
      </div>
    </div>
  );
}
