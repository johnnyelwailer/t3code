import { useShallow } from "zustand/react/shallow";
import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { toUserFacingError } from "~/t3team/components/error/t3team-errorMessage";
import { DraftDocumentReviewQueue } from "~/t3team/t3team-DraftDocumentReviewQueue";
import {
  selectJiraDocumentDrafts,
  useT3TeamDraftMutationStore,
} from "~/t3team/t3team-draftMutationStore";
import type {
  T3TeamDocumentDraftMutation,
  T3TeamDraftRichContent,
} from "~/t3team/t3team-draftMutationTypes";

function currentDescriptionContent(input: {
  readonly descriptionHtml?: string | undefined;
  readonly descriptionMarkdown?: string | undefined;
  readonly htmlBaseUrl?: string | undefined;
}): T3TeamDraftRichContent | undefined {
  if (input.descriptionHtml) {
    return {
      format: "html",
      body: input.descriptionHtml,
      ...(input.htmlBaseUrl ? { baseUrl: input.htmlBaseUrl } : {}),
    };
  }
  if (input.descriptionMarkdown) {
    return { format: "markdown", body: input.descriptionMarkdown };
  }
  return undefined;
}

export function TicketDetailDraftDocumentReview({
  projectId,
  issueIdOrKey,
  descriptionMarkdown,
  descriptionHtml,
  htmlBaseUrl,
  backend,
  accountId,
  onReload,
}: {
  readonly projectId: string;
  readonly issueIdOrKey: string;
  readonly descriptionMarkdown?: string;
  readonly descriptionHtml?: string;
  readonly htmlBaseUrl?: string;
  /** Present only with a live Atlassian connection — comment drafts apply through the same
   * `addIssueComment` call the direct comment composer uses; without it, applying stays disabled. */
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  const drafts = useT3TeamDraftMutationStore(
    useShallow(selectJiraDocumentDrafts({ projectId, issueIdOrKey })),
  );
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const setDraftStatus = useT3TeamDraftMutationStore((state) => state.setDraftStatus);
  const currentDescription = currentDescriptionContent({
    descriptionMarkdown,
    descriptionHtml,
    htmlBaseUrl,
  });
  const canApplyComments = Boolean(backend && accountId && onReload);
  const enrichedDrafts = drafts.map((draft): T3TeamDocumentDraftMutation => {
    if (draft.field === "description") {
      if (draft.currentContent) return draft;
      return {
        ...draft,
        ...(currentDescription ? { currentContent: currentDescription } : {}),
        applyUnavailableReason: "Jira description write routes are not available yet.",
      };
    }
    return canApplyComments
      ? draft
      : { ...draft, applyUnavailableReason: "Connect Atlassian to post this comment." };
  });

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
