import { useShallow } from "zustand/react/shallow";
import { DraftDocumentReviewQueue } from "~/t3work/t3work-DraftDocumentReviewQueue";
import {
  selectJiraDocumentDrafts,
  useT3WorkDraftMutationStore,
} from "~/t3work/t3work-draftMutationStore";
import type {
  T3WorkDocumentDraftMutation,
  T3WorkDraftRichContent,
} from "~/t3work/t3work-draftMutationTypes";

function currentDescriptionContent(input: {
  readonly descriptionHtml?: string | undefined;
  readonly descriptionMarkdown?: string | undefined;
  readonly htmlBaseUrl?: string | undefined;
}): T3WorkDraftRichContent | undefined {
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
  const drafts = useT3WorkDraftMutationStore(
    useShallow(selectJiraDocumentDrafts({ projectId, issueIdOrKey })),
  );
  const discardDraft = useT3WorkDraftMutationStore((state) => state.discardDraft);
  const currentDescription = currentDescriptionContent({
    descriptionMarkdown,
    descriptionHtml,
    htmlBaseUrl,
  });
  const enrichedDrafts = drafts.map((draft): T3WorkDocumentDraftMutation => {
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
