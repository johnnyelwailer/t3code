import { useMemo } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { draftContentToComparableText } from "~/t3team/t3team-draftMutationDiff";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import {
  isT3TeamDocumentDraftMutation,
  type T3TeamDraftMutation,
} from "~/t3team/t3team-draftMutationTypes";
import { deliverDraftFeedbackToSourceThread } from "~/t3team/workitem/t3team-deliverDraftFeedbackToSourceThread";
import {
  buildDraftDiffParagraphs,
  draftDiffMagnitude,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { useWorkItemDraftStripScalarAccept } from "~/t3team/workitem/t3team-useWorkItemDraftStripScalarAccept";
import { useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";
import type { WorkItemFieldMutations } from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import type { WorkItemDraftStripRowData } from "~/t3team/workitem/t3team-WorkItemDraftStripRow";
import {
  documentFieldLabel,
  scalarDraftChangeLine,
  scalarFieldLabel,
} from "~/t3team/workitem/t3team-workItemDraftStripRowContent";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

/**
 * Assembles everything the strip needs: one row per pending draft, the shared Comment/Dismiss
 * wiring, and an accept-all scoped to strip-resolvable (scalar) rows only — a document draft is
 * never included, so one click can never commit prose nobody has read.
 */
export function useWorkItemDraftStrip(input: {
  readonly issueIdOrKey: string;
  readonly projectId: string;
  readonly model: WorkItemFieldModel;
  readonly mutations: WorkItemFieldMutations;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload: () => void;
  readonly descriptionCurrentText?: string | undefined;
  readonly onReviewDescription: () => void;
  readonly onReviewComments: () => void;
}) {
  const { issueIdOrKey, projectId, model, mutations, backend, accountId, onReload } = input;
  const draftsByField = useWorkItemDrafts({ projectId, issueIdOrKey });
  /** Distinct from `input.backend` (Jira only): the app backend is what can address a thread. */
  const appBackend = useBackend();
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const returnDraftWithFeedback = useT3TeamDraftMutationStore((state) => state.returnDraftWithFeedback);
  const highlightField = useWorkItemDraftReviewUiStore((state) => state.highlightField);
  const resolveScalarAccept = useWorkItemDraftStripScalarAccept({
    issueIdOrKey,
    projectId,
    mutations,
    ...(backend ? { backend } : {}),
    ...(accountId ? { accountId } : {}),
    onReload,
  });

  const drafts = useMemo(() => Object.values(draftsByField), [draftsByField]);

  function onComment(draft: T3TeamDraftMutation, feedback: string) {
    returnDraftWithFeedback(draft.id, feedback);
    void deliverDraftFeedbackToSourceThread({
      backend: appBackend,
      sourceThreadId: draft.sourceThreadId,
      draftId: draft.id,
      issueIdOrKey: draft.target.issueIdOrKey,
      field: draft.field,
      feedback,
    });
  }

  const rows: WorkItemDraftStripRowData[] = drafts.map((draft) => {
    const pending = draft.status === "applying";
    const highlighted = highlightField !== undefined && draft.field === highlightField;
    const shared = {
      id: draft.id,
      pending,
      highlighted,
      onComment: (feedback: string) => onComment(draft, feedback),
      onDismiss: () => discardDraft(draft.id),
    };

    if (isT3TeamDocumentDraftMutation(draft)) {
      const paragraphs = buildDraftDiffParagraphs(
        draft.field === "description" ? input.descriptionCurrentText : undefined,
        draftContentToComparableText(draft.proposedContent),
      );
      const { added, removed } = draftDiffMagnitude(paragraphs);
      return {
        ...shared,
        fieldLabel: documentFieldLabel(draft.field),
        summary: draft.summary ?? `${added + removed} word${added + removed === 1 ? "" : "s"} changed`,
        reviewInPlace: {
          onClick: draft.field === "description" ? input.onReviewDescription : input.onReviewComments,
          added,
          removed,
        },
      };
    }

    return {
      ...shared,
      fieldLabel: scalarFieldLabel(draft.field),
      changeLine: scalarDraftChangeLine(draft, model),
      summary: draft.summary,
      accept: resolveScalarAccept(draft),
    };
  });

  const resolvableRows = rows.filter((row) => row.accept !== undefined);

  return {
    rows,
    resolvableCount: resolvableRows.length,
    onAcceptResolvable:
      resolvableRows.length > 0 ? () => resolvableRows.forEach((row) => row.accept?.()) : undefined,
    onDismissAll: () => rows.forEach((row) => row.onDismiss()),
  };
}
