/**
 * The mirror's watermark catch-up against a simulated Jira project larger than
 * one walk's page cap (200 pages × 100 = 20,000 issues): long gaps are closed,
 * a capped or failed reconcile is never a success and never prunes, the
 * watermark survives a restart, and the digest's "synced" label only moves on
 * a completed catch-up.
 *
 * Walks pause in bursts on `Effect.sleep`, so each test drives the TestClock
 * forward until the forked walk settles; the live zero-delay yield in each step
 * only lets the fake's already-resolved promise land.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";

import { layerFromPath, layerMemory } from "./persistence/Sqlite.ts";
import { upsertMirrorIssues } from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
import {
  runMirrorCatchUpWalk,
  runMirrorReconcile,
} from "./t3team-atlassian-backlog-mirrorSyncWalks.ts";
import { MIRROR_SYNC_RATE_LIMITED_TEXT } from "./t3team-atlassian-mirrorSyncFailureText.ts";
import { runMirrorLoop } from "./t3team-atlassian-mirrorSyncLoop.ts";
import type { MirrorPageSource } from "./t3team-atlassian-mirrorSyncPageWalk.ts";
import {
  advanceT3TeamMirrorWatermark,
  readT3TeamMirrorSyncStatus,
} from "./t3team-atlassian-mirrorSyncState.ts";
import { readDigestJiraHealth } from "./t3team-myworkDigestJiraHealth.ts";

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const jiraNowMs = Date.UTC(2026, 9, 12, 12);
const account = { id: "https://catch-up.atlassian.net", provider: "atlassian" };
const request = { account, externalProjectId: "IES" };
const identity = { provider: "atlassian", accountId: account.id, externalProjectId: "IES" };
const notSuperseded = () => false;

type FakeIssue = { readonly id: string; readonly displayId: string; readonly updatedAt: string };

const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

/** 20,000 issues last touched before the gap, then 1,100 changed during the last 25 days. */
const issuesBeforeGap: ReadonlyArray<FakeIssue> = Array.from({ length: 20_000 }, (_, i) => ({
  id: `old-${i}`,
  displayId: `IES-${i}`,
  updatedAt: isoAt(jiraNowMs - 60 * dayMs + i * 1_000),
}));
const issuesChangedInGap: ReadonlyArray<FakeIssue> = Array.from({ length: 1_100 }, (_, i) => ({
  id: `gap-${i}`,
  displayId: `IES-${20_000 + i}`,
  updatedAt: isoAt(jiraNowMs - 25 * dayMs + i * 30 * minuteMs),
}));
const allIssues = [...issuesBeforeGap, ...issuesChangedInGap];

type PageCall = { readonly updatedWithinMinutes: number | undefined };

/**
 * A Jira project answering `updated >= -Nm ORDER BY updated ASC` with offset
 * cursors. `failCall` makes that (1-based) call throw `failure`.
 */
function fakeJira(
  issues: ReadonlyArray<FakeIssue>,
  options: { readonly failCall?: number; readonly failure?: unknown } = {},
) {
  const calls: Array<PageCall> = [];
  const source: MirrorPageSource = {
    listProjectMirrorPage: async (input) => {
      calls.push({ updatedWithinMinutes: input.updatedWithinMinutes });
      if (calls.length === options.failCall) throw options.failure ?? new Error("Jira is down");
      const cutoffMs = input.updatedWithinMinutes
        ? jiraNowMs - input.updatedWithinMinutes * minuteMs
        : Number.NEGATIVE_INFINITY;
      const matching = issues.filter((issue) => Date.parse(issue.updatedAt) >= cutoffMs);
      const offset = Number(input.cursor ?? 0);
      const end = offset + (input.limit ?? 100);
      return {
        items: matching.slice(offset, end),
        nextCursor: end < matching.length ? String(end) : undefined,
      };
    },
  };
  return { source, calls };
}

/** Runs `effect` to completion while advancing the TestClock past its sleeps. */
const settle = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(effect);
    for (let step = 0; step < 20_000 && fiber.pollUnsafe() === undefined; step++) {
      yield* TestClock.adjust("3 seconds");
      yield* TestClock.withLive(Effect.sleep("0 millis"));
    }
    return yield* Fiber.await(fiber);
  });

const settleValue = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  settle(effect).pipe(
    Effect.flatMap((exit) =>
      Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.die(exit.cause),
    ),
  );

const mirroredIds = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ issueId: string }>`
    SELECT issue_id AS "issueId" FROM t3team_atlassian_backlog_issues
    WHERE provider = ${identity.provider} AND account_id = ${identity.accountId}
      AND external_project_id = ${identity.externalProjectId}
  `;
  return new Set(rows.map((row) => row.issueId));
});

const startAtJiraNow = TestClock.setTime(jiraNowMs);

it.effect(
  "a first catch-up walks past the 20,000-issue page cap by resuming at the watermark",
  () =>
    Effect.gen(function* () {
      yield* startAtJiraNow;
      const jira = fakeJira(allIssues);
      const first = yield* settleValue(
        runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded),
      );
      assert.strictEqual(first, "more-pending");
      assert.strictEqual(
        (yield* readT3TeamMirrorSyncStatus(identity)).watermarkMs,
        Date.parse(issuesBeforeGap[19_999]!.updatedAt),
      );

      const second = yield* settleValue(
        runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded),
      );
      assert.strictEqual(second, "caught-up");
      assert.strictEqual((yield* mirroredIds).size, allIssues.length);
    }).pipe(Effect.provide(layerMemory)),
);

it.effect("after a 25-day gap one catch-up walk fetches every change since the watermark", () =>
  Effect.gen(function* () {
    yield* startAtJiraNow;
    yield* upsertMirrorIssues({ identity, items: issuesBeforeGap });
    yield* advanceT3TeamMirrorWatermark(identity, Date.parse(issuesBeforeGap[19_999]!.updatedAt));

    const jira = fakeJira(allIssues);
    const outcome = yield* settleValue(
      runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded),
    );

    assert.strictEqual(outcome, "caught-up");
    assert.isAtLeast(jira.calls[0]?.updatedWithinMinutes ?? 0, 25 * 24 * 60);
    const ids = yield* mirroredIds;
    assert.isTrue(issuesChangedInGap.every((issue) => ids.has(issue.id)));
    assert.strictEqual(
      (yield* readT3TeamMirrorSyncStatus(identity)).watermarkMs,
      Date.parse(issuesChangedInGap[1_099]!.updatedAt),
    );
  }).pipe(Effect.provide(layerMemory)),
);

const staleRow = { id: "deleted-in-jira", displayId: "IES-GONE", updatedAt: isoAt(0) };

it.effect(
  "a reconcile capped at the page limit is incomplete, prunes nothing, records no success",
  () =>
    Effect.gen(function* () {
      yield* startAtJiraNow;
      yield* upsertMirrorIssues({ identity, items: [staleRow] });

      const outcome = yield* settleValue(
        runMirrorReconcile(request, fakeJira(allIssues).source, identity, notSuperseded),
      );

      assert.strictEqual(outcome, "incomplete");
      assert.isTrue((yield* mirroredIds).has(staleRow.id));
      assert.isUndefined((yield* readT3TeamMirrorSyncStatus(identity)).lastSuccessAtMs);
    }).pipe(Effect.provide(layerMemory)),
);

it.effect("a reconcile whose page fetch fails prunes nothing and records no success", () =>
  Effect.gen(function* () {
    yield* startAtJiraNow;
    yield* upsertMirrorIssues({ identity, items: [staleRow] });

    const exit = yield* settle(
      runMirrorReconcile(
        request,
        fakeJira(issuesBeforeGap.slice(0, 300), { failCall: 2 }).source,
        identity,
        notSuperseded,
      ),
    );

    assert.isTrue(Exit.isFailure(exit));
    assert.isTrue((yield* mirroredIds).has(staleRow.id));
    assert.isUndefined((yield* readT3TeamMirrorSyncStatus(identity)).lastSuccessAtMs);
  }).pipe(Effect.provide(layerMemory)),
);

it.effect(
  "the watermark survives a restart, so the next process resumes instead of restarting",
  () =>
    Effect.gen(function* () {
      yield* startAtJiraNow;
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3team-mirror-watermark-" });
      const database = () => layerFromPath(`${dir}/state.sqlite`);
      const jira = fakeJira(allIssues);

      const first = yield* settleValue(
        runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded),
      ).pipe(Effect.provide(database()));
      assert.strictEqual(first, "more-pending");

      const callsBeforeRestart = jira.calls.length;
      const second = yield* settleValue(
        runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded).pipe(
          Effect.andThen((outcome) => mirroredIds.pipe(Effect.map((ids) => ({ outcome, ids })))),
        ),
      ).pipe(Effect.provide(database()));

      assert.isDefined(jira.calls[callsBeforeRestart]?.updatedWithinMinutes);
      assert.strictEqual(second.outcome, "caught-up");
      assert.strictEqual(second.ids.size, allIssues.length);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

it.effect(
  "the digest's synced-at moves only when a catch-up walk completes, pending until then",
  () =>
    Effect.gen(function* () {
      yield* startAtJiraNow;
      const project = { account, externalProjectId: "IES" };

      yield* settle(
        runMirrorCatchUpWalk(
          request,
          fakeJira(allIssues, { failCall: 3 }).source,
          identity,
          notSuperseded,
        ),
      );
      const beforeFirstCatchUp = yield* readDigestJiraHealth(project, true);
      assert.isUndefined(beforeFirstCatchUp.jiraSyncedAt);
      assert.isTrue(beforeFirstCatchUp.jiraSyncPending, "the first sync reads as in progress");
      assert.isUndefined((yield* readDigestJiraHealth(project, false)).jiraSyncPending);

      const jira = fakeJira(allIssues);
      yield* settleValue(runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded));
      assert.isUndefined(
        (yield* readDigestJiraHealth(project, true)).jiraSyncedAt,
        "a capped walk is not synced",
      );

      const catchUpStartMs = yield* Clock.currentTimeMillis;
      yield* settleValue(runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded));
      const caughtUp = yield* readDigestJiraHealth(project, true);
      assert.strictEqual(caughtUp.jiraSyncedAt, isoAt(catchUpStartMs));
      assert.isUndefined(caughtUp.jiraSyncPending);
    }).pipe(Effect.provide(layerMemory)),
);

it.effect("the loop records a rate-limited walk, backs off, and resumes to catch up", () =>
  Effect.gen(function* () {
    yield* startAtJiraNow;
    const rateLimited = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const jira = fakeJira(issuesChangedInGap, { failCall: 1, failure: rateLimited });
    let stopped = false;
    const loop = yield* Effect.forkChild(
      runMirrorLoop(
        request,
        "loop-test",
        () => stopped,
        () => Effect.succeed(jira.source),
      ),
    );

    let failureAtMs: number | undefined;
    let status = yield* readT3TeamMirrorSyncStatus(identity);
    for (let step = 0; step < 2_000 && status.lastSuccessAtMs === undefined; step++) {
      yield* TestClock.adjust("3 seconds");
      yield* TestClock.withLive(Effect.sleep("0 millis"));
      status = yield* readT3TeamMirrorSyncStatus(identity);
      if (status.lastError !== undefined) {
        assert.strictEqual(status.lastError, MIRROR_SYNC_RATE_LIMITED_TEXT);
        failureAtMs = status.lastErrorAtMs;
      }
    }
    stopped = true;
    yield* Fiber.interrupt(loop);

    assert.isDefined(failureAtMs, "the rate-limited walk must be recorded");
    assert.isAtLeast((status.lastSuccessAtMs ?? 0) - (failureAtMs ?? 0), 5 * minuteMs);
    assert.isUndefined(status.lastError, "a successful catch-up clears the recorded failure");
    assert.strictEqual((yield* mirroredIds).size, issuesChangedInGap.length);
  }).pipe(Effect.provide(layerMemory)),
);
