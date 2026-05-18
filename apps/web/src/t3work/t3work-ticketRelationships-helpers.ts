import {
  extractRelationshipKeys,
  normalizeRelationshipKey,
} from "~/t3work/t3work-ticketRelationshipKeys";
import type { ProjectTicket } from "~/t3work/t3work-types";

export type RelationshipEntry = {
  key: string;
  ticket?: ProjectTicket;
};

export function toRelationshipTicket(entry: RelationshipEntry, projectId: string): ProjectTicket {
  if (entry.ticket) return entry.ticket;
  const displayKey = normalizeRelationshipKey(entry.key) ?? entry.key;
  return {
    id: displayKey,
    projectId,
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: displayKey,
      displayId: displayKey,
      title: displayKey,
      url: "",
      projectId,
      type: "Issue",
    },
    issueType: "Issue",
    status: "Unknown",
    updatedAt: new Date(0).toISOString(),
  };
}

function findTicketByKey(tickets: ProjectTicket[], key: string): ProjectTicket | undefined {
  return tickets.find(
    (candidate) =>
      candidate.id === key || candidate.ref.displayId === key || candidate.ref.id === key,
  );
}

function mergeEntries(entries: readonly RelationshipEntry[]): RelationshipEntry[] {
  const deduped = new Map<string, RelationshipEntry>();
  for (const entry of entries) {
    const existing = deduped.get(entry.key);
    if (!existing) {
      deduped.set(entry.key, entry);
      continue;
    }
    deduped.set(entry.key, {
      ...existing,
      ...(entry.ticket ? { ticket: entry.ticket } : {}),
    });
  }
  return [...deduped.values()];
}

export function buildTicketRelationships(input: {
  projectTickets: ProjectTicket[];
  ticketId: string;
  displayId: string;
  ticketParentId: string | undefined;
  snapshotParentId: string | undefined;
  snapshotRaw: unknown;
}) {
  const parsed = extractRelationshipKeys(input.snapshotRaw);
  const parentKey =
    normalizeRelationshipKey(input.ticketParentId) ??
    normalizeRelationshipKey(input.snapshotParentId) ??
    parsed.parentKey;
  const parentTicket = parentKey ? findTicketByKey(input.projectTickets, parentKey) : undefined;
  const parentEntry: RelationshipEntry | undefined = parentKey
    ? { key: parentKey, ...(parentTicket ? { ticket: parentTicket } : {}) }
    : undefined;

  const parentKeys = new Set<string>([input.ticketId, input.displayId]);
  const childFromProject = input.projectTickets
    .filter((candidate) => candidate.parentId && parentKeys.has(candidate.parentId))
    .map((ticket) => ({
      key: ticket.ref.displayId ?? ticket.id,
      ticket,
    }));
  const childFromSnapshot = parsed.childKeys.map((key) => {
    const ticket = findTicketByKey(input.projectTickets, key);
    return ticket ? { key, ticket } : { key };
  });
  const childEntries = mergeEntries([...childFromProject, ...childFromSnapshot]);

  const referencedEntries = mergeEntries(
    parsed.referenceKeys.map((key) => {
      const ticket = findTicketByKey(input.projectTickets, key);
      return ticket ? { key, ticket } : { key };
    }),
  );

  return { parentEntry, childEntries, referencedEntries };
}
