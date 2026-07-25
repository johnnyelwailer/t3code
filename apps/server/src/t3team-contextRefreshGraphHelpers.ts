import type { ResourceSnapshot } from "@t3tools/project-context";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { readCachedBacklogIssueRows } from "./t3team-atlassian-backlog-cacheQueries.ts";
import { parseJson, type BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import type { T3TeamContextEdgeRecord } from "./t3team-context-cache-tables.ts";
import {
  extractT3TeamJiraRelationshipKeys,
  normalizeT3TeamJiraKey,
  type T3TeamJiraRelationshipKeys,
} from "./t3team-context-jira-relationships.ts";
import {
  resourceRefToT3TeamContextTicket,
  type T3TeamContextTicket,
} from "./t3team-context-ticket.ts";

export type T3TeamSnapshotProvider = IntegrationProvider & {
  readonly downloadAsset?: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

export function putT3TeamContextTicketAliases(
  map: Map<string, T3TeamContextTicket>,
  ticket: T3TeamContextTicket,
): void {
  for (const value of [ticket.id, ticket.ref.id, ticket.ref.displayId]) {
    const key = normalizeT3TeamJiraKey(value);
    if (key) {
      map.set(key, ticket);
    }
  }
}

export function buildT3TeamRelationshipKeys(input: {
  readonly key: string;
  readonly snapshot: ResourceSnapshot | null;
  readonly cachedTickets: ReadonlyArray<T3TeamContextTicket>;
}): T3TeamJiraRelationshipKeys {
  const fromSnapshot = extractT3TeamJiraRelationshipKeys(input.snapshot?.raw);
  const childKeys = new Set(
    fromSnapshot.childKeys.map((key) => normalizeT3TeamJiraKey(key) ?? key),
  );
  for (const ticket of input.cachedTickets) {
    const parentKey = normalizeT3TeamJiraKey(ticket.parentId);
    if (parentKey && parentKey === normalizeT3TeamJiraKey(input.key)) {
      childKeys.add(ticket.ref.displayId);
    }
  }
  return {
    ...(fromSnapshot.parentKey ? { parentKey: fromSnapshot.parentKey } : {}),
    childKeys: [...childKeys],
    referenceKeys: fromSnapshot.referenceKeys,
  };
}

export function buildT3TeamContextEdgeRecords(input: {
  readonly sourceKey: string;
  readonly sourceDepth: number;
  readonly relationships: T3TeamJiraRelationshipKeys;
}): T3TeamContextEdgeRecord[] {
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

export function fetchT3TeamContextSnapshot(input: {
  readonly provider: T3TeamSnapshotProvider;
  readonly key: string;
  readonly externalProjectId: string;
}) {
  // tryPromise, not promise: a provider that throws for an unreachable ref (a
  // dangling parent, a permission-restricted issue) must surface a typed failure
  // the graph walk can skip. Effect.promise would turn it into a defect that the
  // caller's Effect.match cannot catch, killing the whole refresh.
  return Effect.tryPromise(() =>
    input.provider.getResource({
      provider: "atlassian",
      kind: "issue",
      id: input.key,
      projectId: input.externalProjectId,
    }),
  );
}

export function loadCachedT3TeamContextTickets(input: {
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
    const tickets: T3TeamContextTicket[] = [];
    const byKey = new Map<string, T3TeamContextTicket>();
    for (const row of rows) {
      const ref = parseJson<BacklogResourceRef>(row.resourceJson);
      if (!ref) {
        continue;
      }
      const ticket = resourceRefToT3TeamContextTicket({ projectId: input.projectId, ref });
      tickets.push(ticket);
      putT3TeamContextTicketAliases(byKey, ticket);
    }
    return { tickets, byKey };
  });
}
