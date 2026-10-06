import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { serializeBacklogCacheJson } from "./t3team-atlassian-backlog-cacheQueries.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { readDigestDependencies } from "./t3team-myworkDigestDependencies.ts";

const identity = { provider: "atlassian", accountId: "site", externalProjectId: "10008" };

// Shapes from the live IES mirror: links are stored outward only.
const issue = (key: string, extra: object) =>
  ({
    provider: "atlassian",
    kind: "issue",
    id: key,
    displayId: key,
    title: key,
    ...extra,
  }) as unknown as BacklogResourceRef;

const mine = issue("IES-20767", {
  parentId: "IES-21795",
  assignee: "Philip",
  links: [
    { outward: "blocks", key: "IES-22428" },
    { outward: "relates to", key: "IES-20032" },
  ],
});
const rows = [
  mine,
  issue("IES-22428", { assignee: "Anna", status: "To Do" }),
  issue("IES-20032", { assignee: "Ben", status: "In Progress" }),
  issue("IES-19000", {
    assignee: "Kai",
    status: "In Progress",
    links: [{ outward: "blocks", key: "IES-20767" }],
  }),
  issue("IES-22745", { assignee: "Mia", status: "In Progress", parentId: "IES-21795" }),
];

it.layer(SqlitePersistenceMemory)("readDigestDependencies", (it) => {
  it.effect("names who waits on the viewer, whom they wait on, and who shares the story", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const sql = yield* SqlClient.SqlClient;
      for (const [index, row] of rows.entries()) {
        yield* sql`
          INSERT INTO t3team_atlassian_backlog_issues (
            provider, account_id, external_project_id, issue_id, issue_key, resource_json, updated_at
          ) VALUES (
            ${identity.provider}, ${identity.accountId}, ${identity.externalProjectId},
            ${String(index)}, ${(row as { displayId: string }).displayId},
            ${serializeBacklogCacheJson(row)}, ${index}
          )`;
      }
      const dependencies = yield* readDigestDependencies({ identity, assigned: [mine] });
      assert.deepStrictEqual(
        dependencies.map((d) => `${d.ticketKey} ${d.relation} ${d.other.key} ${d.other.assignee}`),
        [
          "IES-20767 waits-on-you IES-22428 Anna",
          "IES-20767 you-wait-on IES-19000 Kai",
          "IES-20767 same-story IES-22745 Mia",
        ],
      );
    }),
  );
});
