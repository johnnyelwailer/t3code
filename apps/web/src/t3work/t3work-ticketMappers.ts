import type { ExternalResourceRef, ResourceSnapshot } from "@t3tools/project-context";
import type { ProjectTicket } from "~/t3work/t3work-types";

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readAssignee(value: unknown): string | undefined {
  const direct = readOptionalString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return undefined;
  return readOptionalString((value as Record<string, unknown>).displayName);
}

function readNamedField(value: unknown): string | undefined {
  const direct = readOptionalString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return undefined;
  return readOptionalString((value as Record<string, unknown>).name);
}

function readIssueType(value: unknown): string | undefined {
  return readNamedField(value);
}

function readIssueTypeIconUrl(value: unknown): string | undefined {
  const direct = readOptionalString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return readOptionalString(record.iconUrl) ?? readOptionalString(record.iconURL);
}

function readLabels(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.filter((label): label is string => typeof label === "string");
  return parsed.length > 0 ? parsed : undefined;
}

export function resourceRefToProjectTicket(
  projectId: string,
  ref: ExternalResourceRef,
): ProjectTicket {
  const resourceWithParent = ref as ExternalResourceRef & {
    parentId?: unknown;
    description?: unknown;
    assigneeAccountId?: unknown;
    estimateValue?: unknown;
    issueTypeIsSubtask?: unknown;
    timeOriginalEstimateSeconds?: unknown;
    timeRemainingEstimateSeconds?: unknown;
    aggregateTimeOriginalEstimateSeconds?: unknown;
    aggregateTimeRemainingEstimateSeconds?: unknown;
    subtaskCount?: unknown;
    sprintId?: unknown;
    sprintName?: unknown;
    sprintState?: unknown;
    sprintBoardId?: unknown;
    sprintGoal?: unknown;
    sprintStartDate?: unknown;
    sprintEndDate?: unknown;
    sprintCompleteDate?: unknown;
  };
  const description = readOptionalString(resourceWithParent.description);
  const assigneeAccountId = readOptionalString(resourceWithParent.assigneeAccountId);
  const estimateValue = readOptionalNumber(resourceWithParent.estimateValue);
  const issueTypeIsSubtask = resourceWithParent.issueTypeIsSubtask === true;
  const timeOriginalEstimateSeconds = readOptionalNumber(
    resourceWithParent.timeOriginalEstimateSeconds,
  );
  const timeRemainingEstimateSeconds = readOptionalNumber(
    resourceWithParent.timeRemainingEstimateSeconds,
  );
  const aggregateTimeOriginalEstimateSeconds = readOptionalNumber(
    resourceWithParent.aggregateTimeOriginalEstimateSeconds,
  );
  const aggregateTimeRemainingEstimateSeconds = readOptionalNumber(
    resourceWithParent.aggregateTimeRemainingEstimateSeconds,
  );
  const subtaskCount = readOptionalNumber(resourceWithParent.subtaskCount);
  const sprintId = readOptionalString(resourceWithParent.sprintId);
  const sprintName = readOptionalString(resourceWithParent.sprintName);
  const sprintState = readOptionalString(resourceWithParent.sprintState);
  const sprintBoardId = readOptionalString(resourceWithParent.sprintBoardId);
  const sprintGoal = readOptionalString(resourceWithParent.sprintGoal);
  const sprintStartDate = readOptionalString(resourceWithParent.sprintStartDate);
  const sprintEndDate = readOptionalString(resourceWithParent.sprintEndDate);
  const sprintCompleteDate = readOptionalString(resourceWithParent.sprintCompleteDate);

  return {
    id: ref.id,
    projectId,
    ...(typeof resourceWithParent.parentId === "string"
      ? { parentId: resourceWithParent.parentId }
      : {}),
    ...(description ? { description } : {}),
    ref: {
      provider: ref.provider,
      kind: ref.kind,
      id: ref.id,
      displayId: ref.displayId ?? ref.id,
      title: ref.title,
      url: ref.url ?? "",
      projectId: ref.projectId ?? "",
      ...(ref.type !== undefined ? { type: ref.type } : {}),
      ...(ref.issueTypeIconUrl !== undefined ? { issueTypeIconUrl: ref.issueTypeIconUrl } : {}),
    },
    ...(ref.type !== undefined ? { issueType: ref.type } : {}),
    ...(issueTypeIsSubtask ? { issueTypeIsSubtask: true } : {}),
    ...(ref.issueTypeIconUrl !== undefined ? { issueTypeIconUrl: ref.issueTypeIconUrl } : {}),
    status: ref.status ?? "Unknown",
    ...(ref.assignee !== undefined ? { assignee: ref.assignee } : {}),
    ...(assigneeAccountId ? { assigneeAccountId } : {}),
    ...(ref.priority !== undefined ? { priority: ref.priority } : {}),
    ...(estimateValue !== undefined ? { estimateValue } : {}),
    ...(timeOriginalEstimateSeconds !== undefined ? { timeOriginalEstimateSeconds } : {}),
    ...(timeRemainingEstimateSeconds !== undefined ? { timeRemainingEstimateSeconds } : {}),
    ...(aggregateTimeOriginalEstimateSeconds !== undefined
      ? { aggregateTimeOriginalEstimateSeconds }
      : {}),
    ...(aggregateTimeRemainingEstimateSeconds !== undefined
      ? { aggregateTimeRemainingEstimateSeconds }
      : {}),
    ...(subtaskCount !== undefined ? { subtaskCount } : {}),
    ...(sprintId ? { sprintId } : {}),
    ...(sprintName ? { sprintName } : {}),
    ...(sprintState ? { sprintState } : {}),
    ...(sprintBoardId ? { sprintBoardId } : {}),
    ...(sprintGoal ? { sprintGoal } : {}),
    ...(sprintStartDate ? { sprintStartDate } : {}),
    ...(sprintEndDate ? { sprintEndDate } : {}),
    ...(sprintCompleteDate ? { sprintCompleteDate } : {}),
    updatedAt: ref.updatedAt ?? new Date().toISOString(),
    ...(readLabels(ref.labels) ? { labels: readLabels(ref.labels) } : {}),
  };
}

export function snapshotToProjectTicket(
  projectId: string,
  snapshot: ResourceSnapshot,
): ProjectTicket {
  const base = resourceRefToProjectTicket(projectId, snapshot.ref);
  const fields = snapshot.fields as Record<string, unknown>;

  const status = readNamedField(fields.status);
  const priority = readNamedField(fields.priority);
  const assignee = readAssignee(fields.assignee);
  const issueType = readIssueType(fields.type) ?? readIssueType(fields.issuetype);
  const issueTypeIconUrl =
    readIssueTypeIconUrl(fields.typeIconUrl) ?? readIssueTypeIconUrl(fields.issuetype);
  const description = readOptionalString(fields.description);
  const labels = readLabels(fields.labels);

  return {
    ...base,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignee ? { assignee } : {}),
    ...(description ? { description } : {}),
    ...(issueType ? { issueType } : {}),
    ...(issueTypeIconUrl ? { issueTypeIconUrl } : {}),
    ...(labels ? { labels } : {}),
  };
}
