import { assert, it } from "@effect/vitest";
import type { ResourceSnapshot } from "@t3tools/project-context";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  ensureT3workContextCacheTables,
  upsertT3workContextResource,
} from "./t3work-context-cache-tables.ts";

const layer = it.layer(SqlitePersistenceMemory);

function snapshot(key: string, title: string): ResourceSnapshot {
  return {
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title,
      projectId: "external-project-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    fetchedAt: "2026-01-01T00:00:00.000Z",
    fields: {},
    text: `${title} body`,
    raw: {},
  };
}

function searchRows() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{ readonly title: string; readonly provider: string }>`
      SELECT provider, account_id, external_project_id, resource_key, title
      FROM t3work_context_search
      ORDER BY provider, account_id, external_project_id, resource_key
    `;
  });
}

layer("t3work context cache tables", (it) => {
  it.effect("scopes FTS delete to the full resource identity tuple", () =>
    Effect.gen(function* () {
      yield* ensureT3workContextCacheTables();
      const sharedKey = "PROJ-1";
      yield* upsertT3workContextResource({
        identity: {
          provider: "atlassian",
          accountId: "account-a",
          externalProjectId: "project-a",
        },
        snapshot: snapshot(sharedKey, "Project A issue"),
      });
      yield* upsertT3workContextResource({
        identity: {
          provider: "atlassian",
          accountId: "account-b",
          externalProjectId: "project-b",
        },
        snapshot: snapshot(sharedKey, "Project B issue"),
      });

      yield* upsertT3workContextResource({
        identity: {
          provider: "atlassian",
          accountId: "account-a",
          externalProjectId: "project-a",
        },
        snapshot: snapshot(sharedKey, "Project A issue updated"),
      });

      const rows = yield* searchRows();
      assert.deepStrictEqual(
        rows.map((row) => [row.provider, row.title]),
        [
          ["atlassian", "Project A issue updated"],
          ["atlassian", "Project B issue"],
        ],
      );
    }),
  );
});
