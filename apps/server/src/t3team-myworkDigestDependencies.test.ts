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

const insertRows = (target: typeof identity, list: readonly BacklogResourceRef[]) =>
  Effect.gen(function* () {
    yield* ensureBacklogCacheTables();
    const sql = yield* SqlClient.SqlClient;
    for (const [index, row] of list.entries()) {
      yield* sql`
        INSERT INTO t3team_atlassian_backlog_issues (
          provider, account_id, external_project_id, issue_id, issue_key, resource_json, updated_at
        ) VALUES (
          ${target.provider}, ${target.accountId}, ${target.externalProjectId},
          ${String(index)}, ${(row as { displayId: string }).displayId},
          ${serializeBacklogCacheJson(row)}, ${index}
        )`;
    }
  });

it.layer(SqlitePersistenceMemory)("readDigestDependencies", (it) => {
  it.effect("names who waits on the viewer and whom they wait on; an epic is no shared story", () =>
    Effect.gen(function* () {
      yield* insertRows(identity, rows);
      const dependencies = yield* readDigestDependencies({ identity, assigned: [mine] });
      // IES-20767 is a story: its parent is an epic, whose other stories are no "same story".
      assert.deepStrictEqual(
        dependencies.map((d) => `${d.ticketKey} ${d.relation} ${d.other.key} ${d.other.assignee}`),
        ["IES-20767 waits-on-you IES-22428 Anna", "IES-20767 you-wait-on IES-19000 Kai"],
      );
    }),
  );

  it.effect("names who shares the story with the viewer's subtask", () =>
    Effect.gen(function* () {
      const project = { ...identity, externalProjectId: "20001" };
      const subtask = issue("ACME-11", {
        parentId: "ACME-10",
        assignee: "Viewer",
        issueTypeIsSubtask: true,
      });
      yield* insertRows(project, [
        subtask,
        issue("ACME-12", {
          assignee: "Bo",
          status: "In Progress",
          parentId: "ACME-10",
          type: "Sub-task",
        }),
        issue("ACME-10", { assignee: "Viewer", status: "In Progress", type: "Story" }),
      ]);
      const dependencies = yield* readDigestDependencies({
        identity: project,
        assigned: [subtask],
      });
      assert.deepStrictEqual(
        dependencies.map((d) => `${d.ticketKey} ${d.relation} ${d.other.key}`),
        ["ACME-11 same-story ACME-12"],
      );
    }),
  );
});
