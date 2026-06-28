import type { ResourceSnapshot } from "@t3tools/project-context";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { readCachedBacklogIssueRows } from "./t3work-atlassian-backlog-cacheQueries.ts";
import { parseJson, type BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";
import type { T3workContextEdgeRecord } from "./t3work-context-cache-tables.ts";
import {
  extractT3workJiraRelationshipKeys,
  normalizeT3workJiraKey,
  type T3workJiraRelationshipKeys,
} from "./t3work-context-jira-relationships.ts";
import {
  resourceRefToT3workContextTicket,
  type T3workContextTicket,
} from "./t3work-context-ticket.ts";

export type T3workSnapshotProvider = IntegrationProvider & {
  readonly downloadAsset?: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

export function putT3workContextTicketAliases(
  map: Map<string, T3workContextTicket>,
  ticket: T3workContextTicket,
): void {
  for (const value of [ticket.id, ticket.ref.id, ticket.ref.displayId]) {
    const key = normalizeT3workJiraKey(value);
    if (key) {
      map.set(key, ticket);
    }
  }
}

export function buildT3workRelationshipKeys(input: {
  readonly key: string;
  readonly snapshot: ResourceSnapshot | null;
  readonly cachedTickets: ReadonlyArray<T3workContextTicket>;
}): T3workJiraRelationshipKeys {
  const fromSnapshot = extractT3workJiraRelationshipKeys(input.snapshot?.raw);
  const childKeys = new Set(
    fromSnapshot.childKeys.map((key) => normalizeT3workJiraKey(key) ?? key),
  );
  for (const ticket of input.cachedTickets) {
    const parentKey = normalizeT3workJiraKey(ticket.parentId);
    if (parentKey && parentKey === normalizeT3workJiraKey(input.key)) {
      childKeys.add(ticket.ref.displayId);
    }
  }
  return {
    ...(fromSnapshot.parentKey ? { parentKey: fromSnapshot.parentKey } : {}),
    childKeys: [...childKeys],
    referenceKeys: fromSnapshot.referenceKeys,
  };
}

export function buildT3workContextEdgeRecords(input: {
  readonly sourceKey: string;
  readonly sourceDepth: number;
  readonly relationships: T3workJiraRelationshipKeys;
}): T3workContextEdgeRecord[] {
  return [
    ...(input.relationships.parentKey
      ? [{ relation: "parent", targetKey: input.relationships.parentKey }]
      : []),
    ...input.relationships.childKeys.map((targetKey) => ({ relation: "child", targetKey })),
    ...input.relationships.referenceKeys.map((targetKey) => ({ relation: "reference", targetKey })),
  ].map((edge) => ({
    sourceKey: input.sourceKey,
    targetKey: edge.targetKey,
    relation: edge.relation,
    depth: input.sourceDepth + 1,
  }));
}

export function fetchT3workContextSnapshot(input: {
  readonly provider: T3workSnapshotProvider;
  readonly key: string;
  readonly externalProjectId: string;
}) {
  return Effect.promise(() =>
    input.provider.getResource({
      provider: "atlassian",
      kind: "issue",
      id: input.key,
      projectId: input.externalProjectId,
    }),
  );
}

export function loadCachedT3workContextTickets(input: {
  readonly identity: {
    readonly provider: string;
    readonly accountId: string;
    readonly externalProjectId: string;
  };
  readonly projectId: string;
}) {
  return Effect.gen(function* () {
    const rows = yield* readCachedBacklogIssueRows(input.identity).pipe(
      Effect.orElseSucceed(() => []),
    );
    const tickets: T3workContextTicket[] = [];
    const byKey = new Map<string, T3workContextTicket>();
    for (const row of rows) {
      const ref = parseJson<BacklogResourceRef>(row.resourceJson);
      if (!ref) {
        continue;
      }
      const ticket = resourceRefToT3workContextTicket({ projectId: input.projectId, ref });
      tickets.push(ticket);
      putT3workContextTicketAliases(byKey, ticket);
    }
    return { tickets, byKey };
  });
}
