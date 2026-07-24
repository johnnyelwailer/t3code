import { useShallow } from "zustand/react/shallow";
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
}: {
  readonly projectId: string;
  readonly issueIdOrKey: string;
  readonly descriptionMarkdown?: string;
  readonly descriptionHtml?: string;
  readonly htmlBaseUrl?: string;
}) {
  const drafts = useT3TeamDraftMutationStore(
    useShallow(selectJiraDocumentDrafts({ projectId, issueIdOrKey })),
  );
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const currentDescription = currentDescriptionContent({
    descriptionMarkdown,
    descriptionHtml,
    htmlBaseUrl,
  });
  const enrichedDrafts = drafts.map((draft): T3TeamDocumentDraftMutation => {
    if (draft.currentContent || draft.field !== "description") return draft;
    return {
      ...draft,
      ...(currentDescription ? { currentContent: currentDescription } : {}),
      applyUnavailableReason: "Jira description/comment write routes are not available yet.",
    };
  });

  return (
    <DraftDocumentReviewQueue
      drafts={enrichedDrafts}
      onDiscard={(draft) => discardDraft(draft.id)}
    />
  );
}
