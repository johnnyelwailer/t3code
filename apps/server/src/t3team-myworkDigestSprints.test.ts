import { assert, it } from "@effect/vitest";
import type { AtlassianBacklogSprint } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { serializeBacklogCacheJson } from "./t3team-atlassian-backlog-cacheQueries.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { alignDigestSprints, readDigestSprints } from "./t3team-myworkDigestSprints.ts";

// Shapes and dates from a live profile on 2026-10-05: the team's sprint 8.6 was
// never started in Jira, and the viewer's tickets still carry 8.5 as "active".
const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const closed85 = {
  id: "4447",
  name: "PW Sprint 8.5",
  state: "closed",
  boardId: "95",
  startDate: "2026-09-03T00:00:00.000Z",
  endDate: "2026-09-23T00:00:00.000Z",
};
const unstarted86 = {
  id: "4448",
  name: "PW Sprint 8.6",
  state: "future",
  boardId: "95",
  startDate: "2026-09-23T22:00:00.000Z",
  endDate: "2026-10-14T21:30:00.000Z",
};
const next91 = {
  ...unstarted86,
  id: "4449",
  name: "PW Sprint 9.1",
  startDate: "2026-10-14T22:00:00.000Z",
  endDate: "2026-11-04T22:00:00.000Z",
};
const otherTeam = { id: "7061", name: "PW2 Sprint 8.6.1", state: "active", boardId: "2511" };

function ticket(
  id: string,
  sprint?: { id: string; name: string; state: string; startDate?: string; endDate?: string },
) {
  return {
    provider: "atlassian",
    kind: "issue",
    id,
    title: id,
    ...(sprint !== undefined
      ? {
          sprintId: sprint.id,
          sprintName: sprint.name,
          sprintState: sprint.state,
          ...(sprint.startDate !== undefined ? { sprintStartDate: sprint.startDate } : {}),
          ...(sprint.endDate !== undefined ? { sprintEndDate: sprint.endDate } : {}),
        }
      : {}),
  } as unknown as BacklogResourceRef;
}

const states = (tickets: ReadonlyArray<BacklogResourceRef>) =>
  tickets.map((t) => (t as { sprintState?: string }).sprintState);

it("board truth beats a stale stamp, and a dated sprint nobody started is the current one", () => {
  const { tickets, sprints } = alignDigestSprints(
    [
      ticket("A", { ...closed85, state: "active" }),
      ticket("B", unstarted86),
      ticket("C", unstarted86),
      ticket("D"),
    ],
    [otherTeam, next91, unstarted86, closed85],
    NOW,
  );
  assert.deepStrictEqual(states(tickets), ["closed", "active", "active", undefined]);
  assert.deepStrictEqual(
    sprints.map((sprint) => `${sprint.name}:${sprint.state}`),
    [
      "PW Sprint 8.6:active",
      "PW2 Sprint 8.6.1:active",
      "PW Sprint 9.1:future",
      "PW Sprint 8.5:closed",
    ],
  );
});

it("an open sprint long past its end is over, whatever the stale stamp says", () => {
  const leftover = { ...closed85, id: "4440", name: "PW Sprint 8.1", state: "active" };
  const { tickets, sprints } = alignDigestSprints([ticket("A", leftover)], [], NOW);
  assert.deepStrictEqual(states(tickets), ["closed"]);
  assert.deepStrictEqual(sprints, []);
});

it("a future sprint that has not begun stays future, and no current sprint leaves the order", () => {
  const { tickets, sprints } = alignDigestSprints([ticket("A", next91)], [next91, otherTeam], NOW);
  assert.deepStrictEqual(states(tickets), ["future"]);
  assert.deepStrictEqual(
    sprints.map((sprint) => sprint.id),
    [next91.id, otherTeam.id],
  );
});

const identity = { provider: "atlassian", accountId: "acc", externalProjectId: "10008" };

const insertView = (selectionKey: string, updatedAt: number, sprints: AtlassianBacklogSprint[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO t3team_atlassian_backlog_views (
        provider, account_id, external_project_id, selection_key, issue_ids_json, boards_json,
        sprints_json, saved_filters_json, capabilities_json, updated_at
      )
      VALUES (
        ${identity.provider}, ${identity.accountId}, ${identity.externalProjectId}, ${selectionKey},
        '[]', '[]', ${serializeBacklogCacheJson(sprints)}, '[]', '{}', ${updatedAt}
      )
    `;
  });

it.layer(SqlitePersistenceMemory)("readDigestSprints", (it) => {
  it.effect("unions every board's sprint list, the newest view winning per sprint", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      yield* insertView("old", 1, [{ ...closed85, state: "active" }]);
      yield* insertView("board95", 3, [unstarted86, closed85]);
      yield* insertView("board2511", 2, [otherTeam]);
      const sprints = yield* readDigestSprints(identity);
      assert.deepStrictEqual(
        sprints.map((sprint) => `${sprint.id}:${sprint.state}`),
        ["4448:future", "4447:closed", "7061:active"],
      );
    }),
  );
});

// 2026-10-15 on Phil's real data: Jira still says 8.6 "active" (ended 10-14 23:30 CEST),
// 9.1 is "future" but running since 10-15 00:00 CEST. Most of the viewer's items are
// still in 8.6 — the old count-based pick wore 8.6; the shared resolver wears 9.1.
it("the calendar-running successor beats an ended sprint nobody completed", () => {
  const now = Date.parse("2026-10-15T08:00:00.000Z");
  const active86 = { ...unstarted86, state: "active", startDate: "2026-10-01T10:22:39.451Z" };
  const real91 = { ...next91, id: "7228" };
  const { tickets, sprints } = alignDigestSprints(
    [ticket("A", active86), ticket("B", active86), ticket("C", active86), ticket("D", real91)],
    [active86, real91],
    now,
  );
  assert.deepStrictEqual(states(tickets), ["closed", "closed", "closed", "active"]);
  assert.strictEqual(sprints[0]?.name, "PW Sprint 9.1");
  assert.strictEqual(sprints[0]?.state, "active");
});

it("an explicit choice leads the digest across views", () => {
  const now = Date.parse("2026-10-15T08:00:00.000Z");
  const real91 = { ...next91, id: "7228" };
  const real92 = { ...next91, id: "7229", name: "PW Sprint 9.2", startDate: "2026-11-04T23:00:00.000Z", endDate: "2026-11-25T22:30:00.000Z" };
  const { sprints } = alignDigestSprints([ticket("A", real91)], [real91, real92], now, {
    sprintId: "7229",
  });
  assert.strictEqual(sprints[0]?.id, "7229");
});
