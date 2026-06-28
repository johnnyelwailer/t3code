import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import {
  type T3workContextEdgeRecord,
  upsertT3workContextResource,
} from "./t3work-context-cache-tables.ts";
import type { T3workContextGraphNode } from "./t3work-context-bundle-builder.ts";
import { normalizeT3workJiraKey } from "./t3work-context-jira-relationships.ts";
import {
  buildT3workContextEdgeRecords,
  buildT3workRelationshipKeys,
  fetchT3workContextSnapshot,
  loadCachedT3workContextTickets,
  putT3workContextTicketAliases,
  type T3workSnapshotProvider,
} from "./t3work-contextRefreshGraphHelpers.ts";
import { snapshotToT3workContextTicket } from "./t3work-context-ticket.ts";

export type T3workForegroundContextGraph = {
  readonly nodes: ReadonlyArray<T3workContextGraphNode>;
  readonly snapshotsByKey: ReadonlyMap<string, ResourceSnapshot>;
  readonly edges: ReadonlyArray<T3workContextEdgeRecord>;
  readonly backgroundSeeds: ReadonlyArray<{ readonly key: string; readonly depth: number }>;
};

export function buildT3workForegroundContextGraph(input: {
  readonly project: ProjectShellProject;
  readonly provider: T3workSnapshotProvider;
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
    const cached = yield* loadCachedT3workContextTickets({ identity, projectId: input.project.id });

    const rootSnapshot = yield* fetchT3workContextSnapshot({
      provider: input.provider,
      key: input.rootKey,
      externalProjectId,
    });
    yield* upsertT3workContextResource({ identity, snapshot: rootSnapshot });
    const rootKey =
      normalizeT3workJiraKey(rootSnapshot.ref.displayId ?? rootSnapshot.ref.id) ?? input.rootKey;
    const rootTicket = snapshotToT3workContextTicket({
      projectId: input.project.id,
      snapshot: rootSnapshot,
    });
    putT3workContextTicketAliases(cached.byKey, rootTicket);
    const rootRelationships = buildT3workRelationshipKeys({
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
      const normalized = normalizeT3workJiraKey(key);
      if (normalized && normalized !== rootKey) {
        directKeys.add(normalized);
      }
    }

    const snapshotsByKey = new Map<string, ResourceSnapshot>([[rootKey, rootSnapshot]]);
    const nodes: T3workContextGraphNode[] = [
      {
        key: rootKey,
        depth: 0,
        ticket: rootTicket,
        snapshot: rootSnapshot,
        relationshipKeys: rootRelationships,
      },
    ];
    const edges = buildT3workContextEdgeRecords({
      sourceKey: rootKey,
      sourceDepth: 0,
      relationships: rootRelationships,
    });
    const backgroundSeeds = new Map<string, { key: string; depth: number }>();

    for (const key of directKeys) {
      const snapshot = yield* Effect.match(
        fetchT3workContextSnapshot({ provider: input.provider, key, externalProjectId }),
        {
          onFailure: (left) => ({ _tag: "Left" as const, left }),
          onSuccess: (right) => ({ _tag: "Right" as const, right }),
        },
      );
      const value = snapshot._tag === "Right" ? snapshot.right : null;
      if (value) {
        snapshotsByKey.set(key, value);
        yield* upsertT3workContextResource({ identity, snapshot: value });
      }
      const ticket = value
        ? snapshotToT3workContextTicket({ projectId: input.project.id, snapshot: value })
        : (cached.byKey.get(key) ?? null);
      const relationships = buildT3workRelationshipKeys({
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
      for (const edge of buildT3workContextEdgeRecords({
        sourceKey: key,
        sourceDepth: 1,
        relationships,
      })) {
        edges.push(edge);
        const normalized = normalizeT3workJiraKey(edge.targetKey);
        if (normalized && normalized !== rootKey && !directKeys.has(normalized)) {
          backgroundSeeds.set(normalized, { key: normalized, depth: 2 });
        }
      }
    }

    return { nodes, snapshotsByKey, edges, backgroundSeeds: [...backgroundSeeds.values()] };
  });
}
