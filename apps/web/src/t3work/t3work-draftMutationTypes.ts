export type T3WorkDraftMutationStatus = "draft" | "applying" | "applied" | "discarded" | "error";

export type T3WorkDraftMutationField =
  | "assignee"
  | "estimate"
  | "status"
  | "description"
  | "comment"
  | "subtask";

export type T3WorkDraftRichContentFormat = "html" | "markdown" | "plain";

export type T3WorkDraftRichContent = {
  readonly format: T3WorkDraftRichContentFormat;
  readonly body: string;
  readonly baseUrl?: string;
};

export type T3WorkDraftTarget = {
  readonly provider: "jira";
  readonly issueIdOrKey: string;
  readonly title?: string;
  readonly url?: string;
};

export type T3WorkDraftMutationBase = {
  readonly id: string;
  readonly projectId?: string;
  readonly sourceThreadId?: string;
  readonly createdAt: string;
  readonly tool?: string;
  readonly target: T3WorkDraftTarget;
  readonly field: T3WorkDraftMutationField;
  readonly status: T3WorkDraftMutationStatus;
  readonly summary?: string;
  readonly error?: string;
};

export type T3WorkDocumentDraftMutation = T3WorkDraftMutationBase & {
  readonly field: "description" | "comment";
  readonly proposedContent: T3WorkDraftRichContent;
  readonly currentContent?: T3WorkDraftRichContent;
  readonly applyUnavailableReason?: string;
};

export type T3WorkScalarDraftMutation = T3WorkDraftMutationBase & {
  readonly field: "assignee" | "estimate" | "status" | "subtask";
  readonly patch: Record<string, unknown>;
};

export type T3WorkDraftMutation = T3WorkDocumentDraftMutation | T3WorkScalarDraftMutation;

export function isT3WorkDocumentDraftMutation(
  draft: T3WorkDraftMutation,
): draft is T3WorkDocumentDraftMutation {
  return draft.field === "description" || draft.field === "comment";
}
