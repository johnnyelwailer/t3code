import type { ProjectShellProject } from "@t3tools/project-context";

import { readCachedAtlassianResourceSnapshot } from "~/t3team/t3team-atlassianResourceSnapshotCache";
import { normalizeRelationshipKey } from "~/t3team/t3team-ticketRelationshipKeys";
import type { RelationshipEntry } from "~/t3team/t3team-ticketRelationships-helpers";

export const TICKET_CONTEXT_GRAPH_LIMITS = {
  maxParentDepth: 3,
  maxDirectChildren: 16,
  maxDirectReferences: 12,
} as const;

type ScoredEntry = {
  key: string;
  hasTicket: boolean;
  hasCachedSnapshot: boolean;
  updatedAt: number;
};

export function normalizeTicketContextEntryKey(entry: RelationshipEntry): string {
  return normalizeRelationshipKey(entry.key) ?? entry.key;
}

function scoreEntry(input: {
  entry: RelationshipEntry;
  project: ProjectShellProject;
}): ScoredEntry {
  const key = normalizeTicketContextEntryKey(input.entry);
  return {
    key,
    hasTicket: Boolean(input.entry.ticket),
    hasCachedSnapshot:
      !input.entry.ticket &&
      Boolean(
        readCachedAtlassianResourceSnapshot({
          project: input.project,
          key,
        }),
      ),
    updatedAt: input.entry.ticket ? Date.parse(input.entry.ticket.updatedAt) || 0 : 0,
  };
}

function compareEntries(left: ScoredEntry, right: ScoredEntry): number {
  if (left.hasTicket !== right.hasTicket) {
    return left.hasTicket ? -1 : 1;
  }
  if (left.hasCachedSnapshot !== right.hasCachedSnapshot) {
    return left.hasCachedSnapshot ? -1 : 1;
  }
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }
  return left.key.localeCompare(right.key);
}

export function selectTicketContextEntries(input: {
  entries: ReadonlyArray<RelationshipEntry>;
  project: ProjectShellProject;
  limit: number;
  excludeKeys?: ReadonlySet<string>;
}): string[] {
  const excludeKeys = input.excludeKeys ?? new Set<string>();
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const candidate of input.entries
    .map((entry) => scoreEntry({ entry, project: input.project }))
    .toSorted(compareEntries)) {
    if (excludeKeys.has(candidate.key) || seen.has(candidate.key)) {
      continue;
    }
    selected.push(candidate.key);
    seen.add(candidate.key);
    if (selected.length >= input.limit) {
      break;
    }
  }

  return selected;
}
