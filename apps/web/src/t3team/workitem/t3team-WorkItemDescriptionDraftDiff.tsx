import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Bot, Check, MessageSquare, X } from "lucide-react";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { Button } from "~/t3team/components/ui/t3team-button";
import { draftContentToComparableText } from "~/t3team/t3team-draftMutationDiff";
import { selectJiraDocumentDrafts, useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import { deliverDraftFeedbackToSourceThread } from "~/t3team/workitem/t3team-deliverDraftFeedbackToSourceThread";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import {
  DIFF_BLOCK_ATTRIBUTE,
  T3TeamDiffCommentThread,
  T3TeamDiffSelectionComposer,
} from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";
import { T3TeamDiffGutter, T3TeamDiffText } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import { applyCommentQuotes } from "~/t3team/workitem/t3team-workItemDiffModel";
import { useWorkItemDiffComments } from "~/t3team/workitem/t3team-useWorkItemDiffComments";
import {
  buildDraftDiffParagraphs,
  draftDiffMagnitude,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";

/** Jira has no description write route wired yet — see `t3team-TicketDetailDraftDocumentReview.tsx`. */
const APPLY_UNAVAILABLE_REASON = "Jira description write routes are not available yet.";

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
  currentText,
}: {
  readonly issueIdOrKey: string;
  readonly projectId: string;
  readonly currentText?: string | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drafts = useT3TeamDraftMutationStore(
    useShallow(selectJiraDocumentDrafts({ projectId, issueIdOrKey })),
  );
  const draft = drafts.find((candidate) => candidate.field === "description");
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const returnDraftWithFeedback = useT3TeamDraftMutationStore((state) => state.returnDraftWithFeedback);
  const closeDescriptionReview = useWorkItemDraftReviewUiStore((state) => state.closeDescriptionReview);
  const comments = useWorkItemDiffComments();
  const backend = useBackend();

  if (!draft) return null; // Accepted/dismissed elsewhere while this was open.

  // The draft's proposed body may be HTML (an older capture path) or markdown/plain — comparable text
  // either way, so an HTML draft doesn't leak raw tags into the word diff.
  const paragraphs = buildDraftDiffParagraphs(
    currentText,
    draftContentToComparableText(draft.proposedContent),
  );
  const { added, removed } = draftDiffMagnitude(paragraphs);
  const acceptDisabled = shouldDisableDescriptionAccept({
    canApply: false,
    pendingCommentCount: comments.total,
  });

  function sendBack() {
    const feedback = comments.comments.map((comment) => `> ${comment.quote}\n${comment.body}`).join("\n\n");
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Bot className="size-3.5 text-primary" aria-hidden="true" />
          Proposed rewrite
        </span>
        <span className="flex items-center gap-2 text-xs tabular-nums">
          {added > 0 ? <span className="text-success-foreground">+{added}</span> : null}
          {removed > 0 ? <span className="text-destructive">−{removed}</span> : null}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Button size="xs" variant="ghost" disabled={comments.total === 0} onClick={sendBack}>
            <MessageSquare className="size-3.5" />
            {comments.total > 0 ? `Send ${comments.total} back` : "Comment"}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              discardDraft(draft!.id);
              closeDescriptionReview();
            }}
          >
            <X className="size-3.5" />
            Dismiss
          </Button>
          <Button size="xs" disabled={acceptDisabled} title={APPLY_UNAVAILABLE_REASON}>
            <Check className="size-3.5" />
            Accept
          </Button>
        </span>
      </div>

      <T3TeamDiffSelectionComposer containerRef={containerRef} onSubmit={comments.add} />

      <div className="space-y-2.5 px-3 py-3 text-sm leading-6 text-foreground">
        {paragraphs.map((paragraph) => (
          <div key={paragraph.id} className="group flex">
            <T3TeamDiffGutter
              {...(paragraph.state ? { state: paragraph.state } : {})}
              commentCount={comments.forBlock(paragraph.id).length}
            />
            <div className="min-w-0 flex-1" {...{ [DIFF_BLOCK_ATTRIBUTE]: paragraph.id }}>
              <p>
                <T3TeamDiffText segments={applyCommentQuotes(paragraph.segments, comments.quotesForBlock(paragraph.id))} />
              </p>
              <T3TeamDiffCommentThread comments={comments.forBlock(paragraph.id)} onRemove={comments.remove} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
