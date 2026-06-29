import type {
  T3WorkDraftMutation,
  T3WorkDraftMutationField,
  T3WorkDraftMutationStatus,
} from "~/t3work/t3work-draftMutationTypes";

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isDraftField(value: unknown): value is T3WorkDraftMutationField {
  return (
    value === "assignee" ||
    value === "estimate" ||
    value === "status" ||
    value === "description" ||
    value === "comment" ||
    value === "subtask"
  );
}

function readStatus(value: unknown): T3WorkDraftMutationStatus {
  return value === "applying" || value === "applied" || value === "discarded" || value === "error"
    ? value
    : "draft";
}

export function buildT3WorkDraftMutationId(input: {
  readonly tool?: string;
  readonly issueIdOrKey: string;
  readonly field: T3WorkDraftMutationField;
  readonly createdAt?: string;
}): string {
  return [
    "jira-draft",
    input.issueIdOrKey.toLowerCase(),
    input.field,
    input.tool ?? "manual",
    input.createdAt ?? "pending",
  ].join(":");
}

export function normalizeT3WorkDraftMutation(input: {
  readonly raw: unknown;
  readonly projectId?: string;
  readonly sourceThreadId?: string;
  readonly createdAt?: string;
  readonly summary?: string;
}): T3WorkDraftMutation | null {
  const raw = readRecord(input.raw);
  const target = readRecord(raw?.target);
  const patch = readRecord(raw?.patch);
  const issueIdOrKey = readString(target?.issueIdOrKey);
  const field = raw && isDraftField(raw.field) ? raw.field : undefined;
  if (raw?.kind !== "jira-work-item-draft" || !issueIdOrKey || !field || !patch) return null;

  const createdAt = input.createdAt ?? new Date().toISOString();
  const tool = readString(raw.tool);
  const base = {
    id:
      readString(raw.id) ??
      buildT3WorkDraftMutationId({
        issueIdOrKey,
        field,
        ...(tool ? { tool } : {}),
        createdAt,
      }),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.sourceThreadId ? { sourceThreadId: input.sourceThreadId } : {}),
    createdAt,
    ...(tool ? { tool } : {}),
    target: { provider: "jira" as const, issueIdOrKey },
    field,
    status: readStatus(raw.status),
    ...(input.summary ? { summary: input.summary } : {}),
  };

  if (field === "description" || field === "comment") {
    const body = readString(field === "description" ? patch.description : patch.body);
    if (!body) return null;
    return {
      ...base,
      field,
      proposedContent: { format: "markdown", body },
    };
  }

  return {
    ...base,
    field,
    patch,
  };
}
