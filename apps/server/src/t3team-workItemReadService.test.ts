// @effect-diagnostics preferSchemaOverJson:off - seeds mirror rows with plain JSON.
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { getMirrorItem, listMirrorChildren, searchMirror } from "./t3team-workItemReadMirror.ts";
import {
  makeWorkItemReadService,
  type WorkItemComment,
  type WorkItemReadPort,
} from "./t3team-workItemReadService.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

const binding: JiraMirrorBinding = {
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId: "10001",
};
const resource = (displayId: string, extra: Record<string, unknown> = {}) => ({
  provider: "atlassian",
  displayId,
  id: displayId,
  title: `Title ${displayId}`,
  status: "Open",
  ...extra,
});

/** A port over an in-memory "tracker"; every query it is sent is recorded. */
const makePort = (input: {
  readonly mirror?: ReadonlyArray<Record<string, unknown>> | "unsynced";
  readonly live?: ReadonlyArray<Record<string, unknown>>;
  readonly comments?: ReadonlyArray<WorkItemComment>;
}) => {
  const liveJql: string[] = [];
  const mirrorQueries: unknown[] = [];
  const mirror = input.mirror === "unsynced" ? [] : (input.mirror ?? []);
  const port: WorkItemReadPort = {
    mirrorReady: () => Effect.succeed(input.mirror !== "unsynced"),
    mirrorSearch: (_b, filters, limit, offset) => {
      mirrorQueries.push(filters);
      return Effect.succeed(mirror.slice(offset, offset + limit));
    },
    mirrorGet: (_b, key) => Effect.succeed(mirror.find((row) => row["displayId"] === key) ?? null),
    mirrorChildren: (_b, parent) =>
      Effect.succeed(mirror.filter((row) => row["parentId"] === parent)),
    searchLive: (_b, jql) => {
      liveJql.push(jql);
      return Effect.succeed({ items: input.live ?? [], nextCursor: "tok" });
    },
    comments: () => Effect.succeed(input.comments ?? []),
  };
  return { service: makeWorkItemReadService(port), liveJql, mirrorQueries };
};

const failure = <A>(effect: Effect.Effect<A, string>) =>
  Effect.flip(effect).pipe(Effect.map((message) => message));

it.effect("search answers filters from the mirror, with a page cursor", () =>
  Effect.gen(function* () {
    const { service, liveJql, mirrorQueries } = makePort({
      mirror: [resource("IES-1"), resource("IES-2"), resource("IES-3")],
    });
    const first = yield* service.search(binding, { status: ["Open"], limit: 2 });
    assert.equal(first.source, "mirror");
    assert.deepEqual(
      first.items.map((item) => item.issueKey),
      ["IES-1", "IES-2"],
    );
    assert.equal(first.nextCursor, "m:2");
    const second = yield* service.search(binding, { status: ["Open"], limit: 2, cursor: "m:2" });
    assert.deepEqual(
      second.items.map((item) => item.issueKey),
      ["IES-3"],
    );
    assert.isUndefined(second.nextCursor);
    assert.deepEqual((mirrorQueries[0] as { status?: unknown }).status, ["Open"]);
    assert.deepEqual(liveJql, []);
  }),
);

it.effect("search with a JQL asks the tracker, scoped to the bound project", () =>
  Effect.gen(function* () {
    const { service, liveJql } = makePort({ live: [resource("IES-9")] });
    const result = yield* service.search(binding, {
      jql: "assignee = currentUser() ORDER BY created DESC",
      status: ["Open"],
    });
    assert.equal(result.source, "live");
    assert.equal(result.nextCursor, "l:tok");
    assert.equal(
      liveJql[0],
      '(assignee = currentUser()) AND (status in ("Open")) AND project in (10001) ORDER BY created DESC',
    );
  }),
);

it.effect("search falls back to the tracker while the mirror has not caught up", () =>
  Effect.gen(function* () {
    const { service, liveJql } = makePort({ mirror: "unsynced", live: [resource("IES-1")] });
    const result = yield* service.search(binding, { text: "login" });
    assert.equal(result.source, "live");
    assert.equal(liveJql[0], '(text ~ "login") AND project in (10001)');
  }),
);

it.effect("search never leaves the project: a widening JQL stays conjoined or is refused", () =>
  Effect.gen(function* () {
    const { service, liveJql } = makePort({});
    const widening = [
      "project = OTHER",
      "project = IES OR project = OTHER",
      "project in (OTHER) OR 1=1",
      "project not in (IES)",
      "key = OTHER-1 ORDER BY created",
      "",
    ];
    for (const jql of widening) {
      yield* service.search(binding, { jql: jql.length === 0 ? " " : jql });
    }
    // Absent JQL plus a filter is the project clause itself, never an unscoped query.
    yield* service.search(binding, { jql: "  ", status: ["Done"] });
    for (const sent of liveJql) {
      assert.match(sent, /\bAND project in \(10001\)( ORDER BY .*)?$|^project in \(10001\)$/, sent);
    }
    assert.equal(liveJql[1], "(project = IES OR project = OTHER) AND project in (10001)");
  }),
);

it.effect("search refuses a JQL whose structure cannot be read, without calling the tracker", () =>
  Effect.gen(function* () {
    const { service, liveJql } = makePort({});
    const refused = [
      "a) OR project = OTHER OR (b",
      'summary ~ "unterminated',
      "(status = Open",
      "status = Open ORDER BY created; DROP",
      "рroject = OTHER",
      "status = Open\nOR project = OTHER",
      "x".repeat(5000),
    ];
    for (const jql of refused) {
      const message = yield* failure(service.search(binding, { jql }));
      assert.include(message, "JQL refused");
    }
    assert.deepEqual(liveJql, []);
  }),
);

it.effect("search refuses a cursor that belongs to the other path or was not issued here", () =>
  Effect.gen(function* () {
    const { service } = makePort({ mirror: [resource("IES-1")] });
    for (const cursor of ["bogus", "m:-1", "m:x"]) {
      assert.include(yield* failure(service.search(binding, { cursor })), "Invalid cursor");
    }
    assert.include(
      yield* failure(service.search(binding, { cursor: "m:1", jql: "status = Open" })),
      "Invalid cursor",
    );
  }),
);

it.effect("get returns fields, description, comments, links and children", () =>
  Effect.gen(function* () {
    const comment = { id: "c1", author: "Pat", body: "ship it", created: "2026-10-01" };
    const { service } = makePort({
      mirror: [
        resource("IES-1", {
          description: "As a user",
          links: [{ outward: "blocks", key: "IES-7" }],
          assignee: "Pat",
          labels: ["a"],
        }),
        resource("IES-2", { parentId: "IES-1", type: "Sub-task" }),
      ],
      comments: [comment],
    });
    const result = yield* service.get(binding, { issueKey: "ies-1" });
    assert.equal(result.item.issueKey, "IES-1");
    assert.equal(result.item.description, "As a user");
    assert.equal(result.item.assignee, "Pat");
    assert.deepEqual(result.comments, [comment]);
    assert.deepEqual(result.links, [{ relation: "blocks", issueKey: "IES-7" }]);
    assert.deepEqual(
      result.children.map((child) => child.issueKey),
      ["IES-2"],
    );
  }),
);

it.effect("get falls back to a scoped tracker read for an item the mirror does not hold yet", () =>
  Effect.gen(function* () {
    const { service, liveJql } = makePort({ mirror: "unsynced", live: [resource("IES-5")] });
    const result = yield* service.get(binding, { issueKey: "IES-5" });
    assert.equal(result.item.issueKey, "IES-5");
    assert.deepEqual(liveJql, [
      '(key = "IES-5") AND project in (10001)',
      '(parent = "IES-5") AND project in (10001)',
    ]);
  }),
);

it.effect("get refuses a key of another project, a key that is not a key, and injection", () =>
  Effect.gen(function* () {
    const { service, liveJql } = makePort({ mirror: [resource("IES-1")] });
    assert.include(
      yield* failure(service.get(binding, { issueKey: "OTHER-1" })),
      "not in this project",
    );
    for (const issueKey of ['IES-1" OR project = OTHER', "IES-1 OR key = X-1", "../x", "IES-"]) {
      assert.include(yield* failure(service.get(binding, { issueKey })), "not a work item key");
    }
    // The tracker was asked about OTHER-1 only through the project-scoped clause.
    assert.deepEqual(liveJql, ['(key = "OTHER-1") AND project in (10001)']);
  }),
);

it.layer(SqlitePersistenceMemory)("the mirror queries are keyed by the binding", (it) => {
  const seed = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE IF NOT EXISTS t3team_atlassian_backlog_issues (
      provider TEXT NOT NULL, account_id TEXT NOT NULL, external_project_id TEXT NOT NULL,
      issue_id TEXT NOT NULL, issue_key TEXT, resource_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
      assignee_account_id TEXT, PRIMARY KEY (provider, account_id, external_project_id, issue_id))`;
    const insert = (project: string, account: string, key: string, extra: object = {}) =>
      sql`INSERT INTO t3team_atlassian_backlog_issues
        (provider, account_id, external_project_id, issue_id, issue_key, resource_json, updated_at)
        VALUES ('atlassian', ${account}, ${project}, ${project + key}, ${key},
          ${JSON.stringify({ ...resource(key), ...extra })}, 1)`;
    yield* insert("10001", "acct-1", "IES-1", { labels: ["a", "b"], parentId: "IES-9" });
    yield* insert("10001", "acct-1", "IES-2", { status: "Done" });
    yield* insert("10002", "acct-1", "OPS-1", { labels: ["a", "b"], parentId: "IES-9" });
    yield* insert("10001", "acct-2", "IES-1", { title: "other account" });
  });

  it.effect("search, get and children cannot reach another project or account", () =>
    Effect.gen(function* () {
      yield* seed;
      const all = yield* searchMirror(binding, {}, 50, 0);
      assert.deepEqual(all.map((row) => row["displayId"]).toSorted(), ["IES-1", "IES-2"]);
      const labelled = yield* searchMirror(
        binding,
        { labels: ["a", "b"], status: ["open"] },
        50,
        0,
      );
      assert.deepEqual(
        labelled.map((row) => row["displayId"]),
        ["IES-1"],
      );
      assert.isNull(yield* getMirrorItem(binding, "OPS-1"));
      assert.equal((yield* getMirrorItem(binding, "IES-1"))?.["title"], "Title IES-1");
      const children = yield* listMirrorChildren(binding, "IES-9", 50);
      assert.deepEqual(
        children.map((row) => row["displayId"]),
        ["IES-1"],
      );
    }),
  );
});
