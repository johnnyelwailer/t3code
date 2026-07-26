import { useShallow } from "zustand/react/shallow";
import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { toUserFacingError } from "~/t3team/components/error/t3team-errorMessage";
import { DraftDocumentReviewQueue } from "~/t3team/t3team-DraftDocumentReviewQueue";
import {
  selectJiraDocumentDrafts,
  useT3TeamDraftMutationStore,
} from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDocumentDraftMutation } from "~/t3team/t3team-draftMutationTypes";

export function TicketDetailDraftDocumentReview({
  projectId,
  issueIdOrKey,
  backend,
  accountId,
  onReload,
}: {
  readonly projectId: string;
  readonly issueIdOrKey: string;
  /** Present only with a live Atlassian connection — comment drafts apply through the same
   * `addIssueComment` call the direct comment composer uses; without it, applying stays disabled. */
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  // Description drafts review in place now (the strip's "Review in place" opens the inline diff
  // right under the description) — this queue would otherwise show the same draft a second time.
  const drafts = useT3TeamDraftMutationStore(
    useShallow(selectJiraDocumentDrafts({ projectId, issueIdOrKey })),
  ).filter((draft) => draft.field === "comment");
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const setDraftStatus = useT3TeamDraftMutationStore((state) => state.setDraftStatus);
  const canApplyComments = Boolean(backend && accountId && onReload);
  const enrichedDrafts = drafts.map((draft): T3TeamDocumentDraftMutation =>
    canApplyComments
      ? draft
      : { ...draft, applyUnavailableReason: "Connect Atlassian to post this comment." },
  );

  async function applyDraft(draft: T3TeamDocumentDraftMutation) {
    if (draft.field !== "comment" || !canApplyComments) return;
    setDraftStatus(draft.id, "applying");
    try {
      await backend!.addIssueComment({
        accountId: accountId!,
        issueIdOrKey,
        body: draft.proposedContent.body,
      });
      setDraftStatus(draft.id, "applied");
      onReload!();
    } catch (cause) {
      setDraftStatus(draft.id, "error", toUserFacingError(cause, { action: "adding the comment" }).headline);
    }
  }

  return (
    <DraftDocumentReviewQueue
      drafts={enrichedDrafts}
      onApply={applyDraft}
      onDiscard={(draft) => discardDraft(draft.id)}
    />
  );
}
