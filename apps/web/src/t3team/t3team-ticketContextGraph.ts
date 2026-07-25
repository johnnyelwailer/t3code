import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";

import type { AddToChatPayloadProgressUpdate } from "~/t3team/t3team-addToChatUtils";
import {
  loadAtlassianResourceSnapshot,
  readCachedAtlassianResourceSnapshot,
} from "~/t3team/t3team-atlassianResourceSnapshotCache";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { normalizeRelationshipKey } from "~/t3team/t3team-ticketRelationshipKeys";
import { buildTicketRelationships } from "~/t3team/t3team-ticketRelationships-helpers";
import { resolveTicketContextKey } from "~/t3team/t3team-ticketContextKey";
import {
  buildScopedTicketContextExpansion,
  createTicketContextSelectionSummary,
  shouldFetchTicketContextSnapshot,
  type TicketContextGraphSelectionSummary,
  type TicketContextGraphWorkItem,
} from "~/t3team/t3team-ticketContextGraphPolicy";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type TicketContextGraphNode = {
  key: string;
  ticket: ProjectTicket | null;
  snapshot: ResourceSnapshot | null;
  relationshipKeys: {
    parentKey?: string;
    childKeys: string[];
    referenceKeys: string[];
  };
  error?: string;
};

export type TicketContextGraph = {
  rootKey: string;
  nodes: ReadonlyMap<string, TicketContextGraphNode>;
  selectionSummary?: TicketContextGraphSelectionSummary;
};

function buildTicketLookup(
  projectTickets: ReadonlyArray<ProjectTicket>,
): Map<string, ProjectTicket> {
  const lookup = new Map<string, ProjectTicket>();
  for (const ticket of projectTickets) {
    for (const candidate of [ticket.id, ticket.ref.id, ticket.ref.displayId]) {
      const normalized = normalizeRelationshipKey(candidate);
      if (normalized) {
        lookup.set(normalized, ticket);
      }
    }
  }
  return lookup;
}

function measureSnapshotBytes(snapshot: ResourceSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length;
}

function buildProgressItems(input: {
  completedKeys: ReadonlyArray<string>;
  currentKey: string;
  queuedKeys: ReadonlyArray<string>;
  lookup: ReadonlyMap<string, ProjectTicket>;
}) {
  const orderedKeys = [...input.completedKeys, input.currentKey, ...input.queuedKeys];
  const seen = new Set<string>();
  return orderedKeys.flatMap((key) => {
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    const ticket = input.lookup.get(key);
    return [
      {
        id: key,
        label: key,
        ...(ticket?.ref.title ? { detail: ticket.ref.title } : {}),
        status: input.completedKeys.includes(key)
          ? ("completed" as const)
          : key === input.currentKey
            ? ("active" as const)
            : ("pending" as const),
      },
    ];
  });
}

export async function buildTicketContextGraph(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<TicketContextGraph> {
  const lookup = buildTicketLookup(input.projectTickets);
  const rootKey =
    normalizeRelationshipKey(resolveTicketContextKey(input.ticket)) ?? input.ticket.id;
  const canFetch = Boolean(
    input.project.source.accountId && input.project.source.externalProjectId,
  );
  const queue: TicketContextGraphWorkItem[] = [{ key: rootKey, kind: "root", depth: 0 }];
  const queuedKeys = new Set<string>([rootKey]);
  const visited = new Set<string>();
  const nodes = new Map<string, TicketContextGraphNode>();
  const completedKeys: string[] = [];
  const selectionSummary = createTicketContextSelectionSummary();
  let downloadedBytes = 0;

  while (queue.length > 0) {
    const workItem = queue.shift();
    if (!workItem || visited.has(workItem.key)) {
      continue;
    }
    queuedKeys.delete(workItem.key);
    const key = workItem.key;
    visited.add(key);

    const ticket = lookup.get(key) ?? null;
    const cachedSnapshot = canFetch
      ? readCachedAtlassianResourceSnapshot({
          project: input.project,
          key,
        })
      : null;
    input.onProgress?.({
      phase: canFetch
        ? cachedSnapshot
          ? "Reusing cached Jira snapshots"
          : "Fetching related Jira snapshots"
        : "Resolving related work items",
      progressCurrent: completedKeys.length,
      progressTotal: completedKeys.length + queue.length + 1,
      syncInfo: {
        contentLabel: "Jira work item context",
        currentItemLabel: key,
        ...(ticket?.ref.title ? { currentItemDetail: ticket.ref.title } : {}),
        ...(downloadedBytes > 0 ? { bytesCurrent: downloadedBytes } : {}),
        items: buildProgressItems({
          completedKeys,
          currentKey: key,
          queuedKeys: queue.map((queuedItem) => queuedItem.key),
          lookup,
        }),
      },
    });

    let snapshot: ResourceSnapshot | null = null;
    let error: string | undefined;
    if (
      canFetch &&
      shouldFetchTicketContextSnapshot({
        workItem,
        ticket,
        cachedSnapshotAvailable: Boolean(cachedSnapshot),
      })
    ) {
      try {
        snapshot =
          cachedSnapshot ??
          (await loadAtlassianResourceSnapshot({
            backend: input.backend,
            project: input.project,
            key,
          }));
        if (!cachedSnapshot) {
          downloadedBytes += measureSnapshotBytes(snapshot);
        }
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
    } else {
      snapshot = cachedSnapshot;
    }

    const relationshipData = buildTicketRelationships({
      projectTickets: [...input.projectTickets],
      ticketId: ticket?.id ?? key,
      displayId: ticket?.ref.displayId ?? key,
      ticketParentId: ticket?.parentId,
      snapshotParentId:
        typeof snapshot?.ref.parentId === "string" ? snapshot.ref.parentId : undefined,
      snapshotRaw: snapshot?.raw,
    });
    const { relationshipKeys, nextItems, selectionDelta } = buildScopedTicketContextExpansion({
      project: input.project,
      workItem,
      ...(relationshipData.parentEntry ? { parentEntry: relationshipData.parentEntry } : {}),
      childEntries: relationshipData.childEntries,
      referencedEntries: relationshipData.referencedEntries,
    });
    selectionSummary.parentChainIncluded += workItem.kind === "parent" ? 1 : 0;
    selectionSummary.directChildrenIncluded += selectionDelta.directChildrenIncluded ?? 0;
    selectionSummary.directChildrenSkipped += selectionDelta.directChildrenSkipped ?? 0;
    selectionSummary.directReferencesIncluded += selectionDelta.directReferencesIncluded ?? 0;
    selectionSummary.directReferencesSkipped += selectionDelta.directReferencesSkipped ?? 0;
    nodes.set(key, { key, ticket, snapshot, relationshipKeys, ...(error ? { error } : {}) });

    for (const nextItem of nextItems) {
      if (nextItem.key === key || visited.has(nextItem.key) || queuedKeys.has(nextItem.key)) {
        continue;
      }
      queue.push(nextItem);
      queuedKeys.add(nextItem.key);
    }

    completedKeys.push(key);
  }

  return { rootKey, nodes, selectionSummary };
}
