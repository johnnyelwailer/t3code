import type { ExternalResourceRef, ResourceSnapshot } from "@t3tools/project-context";
import type { ProjectTicket } from "~/t3work/t3work-types";

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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

export function resourceRefToProjectTicket(
  projectId: string,
  ref: ExternalResourceRef,
): ProjectTicket {
  const resourceWithParent = ref as ExternalResourceRef & { parentId?: unknown };

  return {
    id: ref.id,
    projectId,
    ...(typeof resourceWithParent.parentId === "string"
      ? { parentId: resourceWithParent.parentId }
      : {}),
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
    ...(ref.issueTypeIconUrl !== undefined ? { issueTypeIconUrl: ref.issueTypeIconUrl } : {}),
    status: ref.status ?? "Unknown",
    ...(ref.assignee !== undefined ? { assignee: ref.assignee } : {}),
    ...(ref.priority !== undefined ? { priority: ref.priority } : {}),
    updatedAt: ref.updatedAt ?? new Date().toISOString(),
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

  return {
    ...base,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignee ? { assignee } : {}),
    ...(issueType ? { issueType } : {}),
    ...(issueTypeIconUrl ? { issueTypeIconUrl } : {}),
  };
}
