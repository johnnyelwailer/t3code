/**
 * What keeps the "All projects" digest from saturating the machine: background mirror passes take
 * turns (a foreground kick never waits), a restarted loop stays incremental instead of walking the
 * whole project again, and a page lands as a few multi-row upserts in one transaction.
 */
import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";

import { layerMemory } from "./persistence/Sqlite.ts";
import {
  MIRROR_UPSERT_CHUNK_SIZE,
  upsertMirrorIssues,
} from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
import {
  clearMirrorSyncLanesForTests,
  mirrorSyncLaneOf,
  noteMirrorSyncLane,
  withMirrorSyncLane,
} from "./t3team-atlassian-mirrorSyncLanes.ts";
import { initialReconcileMs } from "./t3team-atlassian-mirrorSyncLoop.ts";
import {
  advanceT3TeamMirrorWatermark,
  readT3TeamMirrorSyncStatus,
  recordT3TeamMirrorCatchUp,
  recordT3TeamMirrorReconcile,
} from "./t3team-atlassian-mirrorSyncState.ts";
import { identity, isoAt, jiraNowMs } from "./t3team-atlassian-mirrorSyncFakeJira.fixtures.ts";

/** A pass that records it started, then holds until released. */
const heldPass = (
  started: Ref.Ref<ReadonlyArray<string>>,
  name: string,
  release: Deferred.Deferred<void>,
) => Ref.update(started, (names) => [...names, name]).pipe(Effect.andThen(Deferred.await(release)));

it.effect("background passes take turns across projects; a foreground pass never waits", () =>
  Effect.gen(function* () {
    clearMirrorSyncLanesForTests();
    noteMirrorSyncLane("a", "background");
    noteMirrorSyncLane("b", "background");
    noteMirrorSyncLane("c", "foreground");
    const started = yield* Ref.make<ReadonlyArray<string>>([]);
    const releaseA = yield* Deferred.make<void>();
    const releaseB = yield* Deferred.make<void>();
    const releaseC = yield* Deferred.make<void>();

    const a = yield* Effect.forkChild(withMirrorSyncLane("a", heldPass(started, "a", releaseA)));
    const b = yield* Effect.forkChild(withMirrorSyncLane("b", heldPass(started, "b", releaseB)));
    const c = yield* Effect.forkChild(withMirrorSyncLane("c", heldPass(started, "c", releaseC)));
    yield* Effect.yieldNow;
    yield* Effect.yieldNow;
    // "b" is queued behind "a"; the foreground "c" runs alongside.
    assert.deepStrictEqual([...(yield* Ref.get(started))].toSorted(), ["a", "c"]);

    yield* Deferred.succeed(releaseA, undefined);
    yield* Fiber.join(a);
    yield* Effect.yieldNow;
    assert.include(yield* Ref.get(started), "b");
    yield* Deferred.succeed(releaseB, undefined);
    yield* Deferred.succeed(releaseC, undefined);
    yield* Fiber.join(b);
    yield* Fiber.join(c);
    clearMirrorSyncLanesForTests();
  }),
);

it("a foreground kick promotes a background loop; a background kick never demotes", () => {
  clearMirrorSyncLanesForTests();
  noteMirrorSyncLane("p", "background");
  assert.equal(mirrorSyncLaneOf("p"), "background");
  noteMirrorSyncLane("p", "foreground");
  assert.equal(mirrorSyncLaneOf("p"), "foreground");
  noteMirrorSyncLane("p", "background");
  assert.equal(mirrorSyncLaneOf("p"), "foreground");
  clearMirrorSyncLanesForTests();
});

it.effect("a fresh project (no rows) reconciles after its first catch-up", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(jiraNowMs);
    assert.equal(yield* initialReconcileMs(identity), Number.NEGATIVE_INFINITY);
  }).pipe(Effect.provide(layerMemory)),
);

it.effect("a mirror with rows but no recorded reconcile stays incremental for ~24 h", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(jiraNowMs);
    yield* advanceT3TeamMirrorWatermark(identity, jiraNowMs - 60_000);
    yield* recordT3TeamMirrorCatchUp(identity, jiraNowMs - 60_000);
    assert.equal(yield* initialReconcileMs(identity), jiraNowMs);
  }).pipe(Effect.provide(layerMemory)),
);

it.effect("a recorded reconcile survives a loop restart", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(jiraNowMs);
    yield* recordT3TeamMirrorCatchUp(identity, jiraNowMs - 60_000);
    yield* recordT3TeamMirrorReconcile(identity, jiraNowMs - 3_600_000);
    assert.equal(
      (yield* readT3TeamMirrorSyncStatus(identity)).lastReconcileAtMs,
      jiraNowMs - 3_600_000,
    );
    assert.equal(yield* initialReconcileMs(identity), jiraNowMs - 3_600_000);
  }).pipe(Effect.provide(layerMemory)),
);

it.effect("an older state table gains the reconcile column on first use", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE t3team_atlassian_mirror_sync_state (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL,
        external_project_id TEXT NOT NULL,
        watermark_ms INTEGER,
        last_success_at INTEGER,
        last_error TEXT,
        last_error_at INTEGER,
        PRIMARY KEY (provider, account_id, external_project_id)
      )
    `;
    yield* recordT3TeamMirrorReconcile(identity, 42);
    assert.equal((yield* readT3TeamMirrorSyncStatus(identity)).lastReconcileAtMs, 42);
  }).pipe(Effect.provide(layerMemory)),
);

it.effect("a page larger than one chunk lands whole, and only newer rows overwrite", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const count = MIRROR_UPSERT_CHUNK_SIZE * 2 + 7;
    const items = Array.from({ length: count }, (_, i) => ({
      id: `i-${i}`,
      displayId: `IES-${i}`,
      title: "first",
      updatedAt: isoAt(jiraNowMs),
      assigneeAccountId: i % 2 === 0 ? "me" : undefined,
    }));
    yield* upsertMirrorIssues({ identity, items });
    const rows = yield* sql<{ readonly n: number }>`
      SELECT COUNT(*) AS n FROM t3team_atlassian_backlog_issues WHERE external_project_id = 'IES'
    `;
    assert.equal(rows[0]?.n, count);

    // An older copy never clobbers; a newer one does.
    yield* upsertMirrorIssues({
      identity,
      items: [
        { id: "i-0", displayId: "IES-0", title: "older", updatedAt: isoAt(jiraNowMs - 1_000) },
        { id: "i-1", displayId: "IES-1", title: "newer", updatedAt: isoAt(jiraNowMs + 1_000) },
      ],
    });
    const titles = yield* sql<{ readonly id: string; readonly title: string }>`
      SELECT issue_id AS id, json_extract(resource_json, '$.title') AS title
      FROM t3team_atlassian_backlog_issues WHERE issue_id IN ('i-0', 'i-1') ORDER BY issue_id
    `;
    assert.deepStrictEqual(
      titles.map((row) => [row.id, row.title]),
      [
        ["i-0", "first"],
        ["i-1", "newer"],
      ],
    );
    const assignee = yield* sql<{ readonly a: string | null }>`
      SELECT assignee_account_id AS a FROM t3team_atlassian_backlog_issues WHERE issue_id = 'i-2'
    `;
    assert.equal(assignee[0]?.a, "me");
  }).pipe(Effect.provide(layerMemory)),
);
