import { assert, it } from "@effect/vitest";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
import { buildT3workForegroundContextGraph } from "./t3work-contextRefreshGraph.ts";

const layer = it.layer(SqlitePersistenceMemory);

function snapshot(key: string, raw: unknown = {}): ResourceSnapshot {
  return {
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title: key,
      projectId: "external-project-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    fetchedAt: "2026-01-01T00:00:00.000Z",
    fields: {},
    raw,
  };
}

const project = {
  id: "project-1",
  title: "Project One",
  source: {
    provider: "atlassian",
    accountId: "account-1",
    externalProjectId: "external-project-1",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as ProjectShellProject;

layer("t3work foreground context graph", (it) => {
  it.effect("fetches direct links and seeds indirect links at depth 2", () =>
    Effect.gen(function* () {
      yield* ensureT3workContextCacheTables();
      const snapshots = new Map([
        [
          "PROJ-1",
          snapshot("PROJ-1", {
            fields: {
              subtasks: [{ key: "PROJ-2" }],
              issuelinks: [{ type: { outward: "relates to" }, outwardIssue: { key: "PROJ-3" } }],
            },
          }),
        ],
        ["PROJ-2", snapshot("PROJ-2", { fields: { subtasks: [{ key: "PROJ-4" }] } })],
        ["PROJ-3", snapshot("PROJ-3")],
      ]);
      const provider = {
        async getResource(ref: unknown) {
          const key = (ref as { id: string }).id;
          const item = snapshots.get(key);
          if (!item) throw new Error(`missing ${key}`);
          return item;
        },
      } as IntegrationProvider;

      const graph = yield* buildT3workForegroundContextGraph({
        project,
        provider,
        rootKey: "PROJ-1",
      });

      assert.deepStrictEqual(
        graph.nodes.map((node) => node.key),
        ["PROJ-1", "PROJ-2", "PROJ-3"],
      );
      assert.deepStrictEqual(graph.backgroundSeeds, [{ key: "PROJ-4", depth: 2 }]);
    }),
  );
});
