export type T3TeamDraftMutationStatus = "draft" | "applying" | "applied" | "discarded" | "error";

export type T3TeamDraftMutationField =
  | "assignee"
  | "estimate"
  | "status"
  | "description"
  | "comment"
  | "subtask";

export type T3TeamDraftRichContentFormat = "html" | "markdown" | "plain";

export type T3TeamDraftRichContent = {
  readonly format: T3TeamDraftRichContentFormat;
  readonly body: string;
  readonly baseUrl?: string;
};

export type T3TeamDraftTarget = {
  readonly provider: "jira";
  readonly issueIdOrKey: string;
  readonly title?: string;
  readonly url?: string;
};

export type T3TeamDraftMutationBase = {
  readonly id: string;
  readonly projectId?: string;
  readonly sourceThreadId?: string;
  readonly createdAt: string;
  readonly tool?: string;
  readonly target: T3TeamDraftTarget;
  readonly field: T3TeamDraftMutationField;
  readonly status: T3TeamDraftMutationStatus;
  readonly summary?: string;
  readonly error?: string;
};

export type T3TeamDocumentDraftMutation = T3TeamDraftMutationBase & {
  readonly field: "description" | "comment";
  readonly proposedContent: T3TeamDraftRichContent;
  readonly currentContent?: T3TeamDraftRichContent;
  readonly applyUnavailableReason?: string;
};

export type T3TeamScalarDraftMutation = T3TeamDraftMutationBase & {
  readonly field: "assignee" | "estimate" | "status" | "subtask";
  readonly patch: Record<string, unknown>;
};

export type T3TeamDraftMutation = T3TeamDocumentDraftMutation | T3TeamScalarDraftMutation;

export function isT3TeamDocumentDraftMutation(
  draft: T3TeamDraftMutation,
): draft is T3TeamDocumentDraftMutation {
  return draft.field === "description" || draft.field === "comment";
}
