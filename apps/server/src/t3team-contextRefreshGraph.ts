import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import {
  type T3TeamContextEdgeRecord,
  upsertT3TeamContextResource,
} from "./t3team-context-cache-tables.ts";
import type { T3TeamContextGraphNode } from "./t3team-context-bundle-builder.ts";
import { normalizeT3TeamJiraKey } from "./t3team-context-jira-relationships.ts";
import {
  buildT3TeamContextEdgeRecords,
  buildT3TeamRelationshipKeys,
  fetchT3TeamContextSnapshot,
  loadCachedT3TeamContextTickets,
  putT3TeamContextTicketAliases,
  type T3TeamSnapshotProvider,
} from "./t3team-contextRefreshGraphHelpers.ts";
import { snapshotToT3TeamContextTicket } from "./t3team-context-ticket.ts";

export type T3TeamForegroundContextGraph = {
  readonly nodes: ReadonlyArray<T3TeamContextGraphNode>;
  readonly snapshotsByKey: ReadonlyMap<string, ResourceSnapshot>;
  readonly edges: ReadonlyArray<T3TeamContextEdgeRecord>;
  readonly backgroundSeeds: ReadonlyArray<{ readonly key: string; readonly depth: number }>;
};

export function buildT3TeamForegroundContextGraph(input: {
  readonly project: ProjectShellProject;
  readonly provider: T3TeamSnapshotProvider;
  readonly rootKey: string;
}) {
  return Effect.gen(function* () {
    const accountId = input.project.source.accountId!;
    const externalProjectId = input.project.source.externalProjectId!;
    const identity = {
      provider: input.project.source.provider,
      accountId,
      externalProjectId,
    };
    const cached = yield* loadCachedT3TeamContextTickets({ identity, projectId: input.project.id });

    const rootSnapshot = yield* fetchT3TeamContextSnapshot({
      provider: input.provider,
      key: input.rootKey,
      externalProjectId,
    });
    yield* upsertT3TeamContextResource({ identity, snapshot: rootSnapshot });
    const rootKey =
      normalizeT3TeamJiraKey(rootSnapshot.ref.displayId ?? rootSnapshot.ref.id) ?? input.rootKey;
    const rootTicket = snapshotToT3TeamContextTicket({
      projectId: input.project.id,
      snapshot: rootSnapshot,
    });
    putT3TeamContextTicketAliases(cached.byKey, rootTicket);
    const rootRelationships = buildT3TeamRelationshipKeys({
      key: rootKey,
      snapshot: rootSnapshot,
      cachedTickets: cached.tickets,
    });
    const directKeys = new Set<string>();
    for (const key of [
      rootRelationships.parentKey,
      ...rootRelationships.childKeys,
      ...rootRelationships.referenceKeys,
    ]) {
      const normalized = normalizeT3TeamJiraKey(key);
      if (normalized && normalized !== rootKey) {
        directKeys.add(normalized);
      }
    }

    const snapshotsByKey = new Map<string, ResourceSnapshot>([[rootKey, rootSnapshot]]);
    const nodes: T3TeamContextGraphNode[] = [
      {
        key: rootKey,
        depth: 0,
        ticket: rootTicket,
        snapshot: rootSnapshot,
        relationshipKeys: rootRelationships,
      },
    ];
    const edges = buildT3TeamContextEdgeRecords({
      sourceKey: rootKey,
      sourceDepth: 0,
      relationships: rootRelationships,
    });
    const backgroundSeeds = new Map<string, { key: string; depth: number }>();

    for (const key of directKeys) {
      const snapshot = yield* Effect.match(
        fetchT3TeamContextSnapshot({ provider: input.provider, key, externalProjectId }),
        {
          onFailure: (left) => ({ _tag: "Left" as const, left }),
          onSuccess: (right) => ({ _tag: "Right" as const, right }),
        },
      );
      const value = snapshot._tag === "Right" ? snapshot.right : null;
      if (value) {
        snapshotsByKey.set(key, value);
        yield* upsertT3TeamContextResource({ identity, snapshot: value });
      }
      const ticket = value
        ? snapshotToT3TeamContextTicket({ projectId: input.project.id, snapshot: value })
        : (cached.byKey.get(key) ?? null);
      const relationships = buildT3TeamRelationshipKeys({
        key,
        snapshot: value,
        cachedTickets: cached.tickets,
      });
      nodes.push({
        key,
        depth: 1,
        ticket,
        snapshot: value,
        relationshipKeys: relationships,
        ...(snapshot._tag === "Left" ? { error: String(snapshot.left) } : {}),
      });
      for (const edge of buildT3TeamContextEdgeRecords({
        sourceKey: key,
        sourceDepth: 1,
        relationships,
      })) {
        edges.push(edge);
        const normalized = normalizeT3TeamJiraKey(edge.targetKey);
        if (normalized && normalized !== rootKey && !directKeys.has(normalized)) {
          backgroundSeeds.set(normalized, { key: normalized, depth: 2 });
        }
      }
    }

    return { nodes, snapshotsByKey, edges, backgroundSeeds: [...backgroundSeeds.values()] };
  });
}
