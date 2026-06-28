import type { ExternalResourceRef, ResourceSnapshot } from "@t3tools/project-context";
import * as DateTime from "effect/DateTime";

export type T3workContextTicket = {
  readonly id: string;
  readonly projectId: string;
  readonly parentId?: string;
  readonly description?: string;
  readonly ref: {
    readonly provider: string;
    readonly kind: string;
    readonly id: string;
    readonly displayId: string;
    readonly title: string;
    readonly type?: string;
    readonly issueTypeIconUrl?: string;
    readonly url: string;
    readonly projectId: string;
  };
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly status: string;
  readonly priority?: string;
  readonly assignee?: string;
  readonly updatedAt: string;
};

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNamedField(value: unknown): string | undefined {
  const direct = readOptionalString(value);
  if (direct) {
    return direct;
  }
  return value && typeof value === "object"
    ? readOptionalString((value as Record<string, unknown>).name)
    : undefined;
}

function readAssignee(value: unknown): string | undefined {
  const direct = readOptionalString(value);
  if (direct) {
    return direct;
  }
  return value && typeof value === "object"
    ? readOptionalString((value as Record<string, unknown>).displayName)
    : undefined;
}

export function resourceRefToT3workContextTicket(input: {
  readonly projectId: string;
  readonly ref: ExternalResourceRef;
}): T3workContextTicket {
  const ref = input.ref as ExternalResourceRef & { readonly parentId?: unknown };
  return {
    id: ref.id,
    projectId: input.projectId,
    ...(typeof ref.parentId === "string" ? { parentId: ref.parentId } : {}),
    ...(ref.description ? { description: ref.description } : {}),
    ref: {
      provider: ref.provider,
      kind: ref.kind,
      id: ref.id,
      displayId: ref.displayId ?? ref.id,
      title: ref.title,
      url: ref.url ?? "",
      projectId: ref.projectId ?? input.projectId,
      ...(ref.type ? { type: ref.type } : {}),
      ...(ref.issueTypeIconUrl ? { issueTypeIconUrl: ref.issueTypeIconUrl } : {}),
    },
    ...(ref.type ? { issueType: ref.type } : {}),
    ...(ref.issueTypeIconUrl ? { issueTypeIconUrl: ref.issueTypeIconUrl } : {}),
    status: ref.status ?? "Unknown",
    ...(ref.priority ? { priority: ref.priority } : {}),
    ...(ref.assignee ? { assignee: ref.assignee } : {}),
    updatedAt: ref.updatedAt ?? DateTime.formatIso(DateTime.nowUnsafe()),
  };
}

export function snapshotToT3workContextTicket(input: {
  readonly projectId: string;
  readonly snapshot: ResourceSnapshot;
}): T3workContextTicket {
  const base = resourceRefToT3workContextTicket({
    projectId: input.projectId,
    ref: input.snapshot.ref,
  });
  const fields = input.snapshot.fields as Record<string, unknown>;
  const status = readNamedField(fields.status);
  const priority = readNamedField(fields.priority);
  const assignee = readAssignee(fields.assignee);
  const issueType = readNamedField(fields.type) ?? readNamedField(fields.issuetype);
  const description = readOptionalString(fields.description);
  return {
    ...base,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignee ? { assignee } : {}),
    ...(description ? { description } : {}),
    ...(issueType ? { issueType } : {}),
  };
}

export function resolveT3workContextTicketKey(ticket: T3workContextTicket): string {
  return ticket.ref.displayId || ticket.ref.id || ticket.id;
}

export function buildT3workContextTicketSummary(ticket: T3workContextTicket) {
  return [
    { label: "Status", value: ticket.status },
    ...(ticket.priority ? [{ label: "Priority", value: ticket.priority }] : []),
    ...(ticket.assignee ? [{ label: "Assignee", value: ticket.assignee }] : []),
    ...(ticket.issueType ? [{ label: "Type", value: ticket.issueType }] : []),
    { label: "Updated", value: ticket.updatedAt },
  ];
}
