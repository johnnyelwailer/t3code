/**
 * After a long gap or a first sync the mirror fills the last 45 days (newest
 * first) before it walks the older history, so the digest has this month's
 * tickets within a few pages. The watermark stays a true "everything up to here
 * is mirrored" mark throughout, and only the full catch-up records the sync.
 */
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { layerMemory } from "./persistence/Sqlite.ts";
import { runMirrorCatchUpWalk } from "./t3team-atlassian-backlog-mirrorSyncWalks.ts";
import {
  account,
  dayMs,
  type FakeIssue,
  fakeJira,
  identity,
  isoAt,
  jiraNowMs,
  minuteMs,
  mirroredIds,
  notSuperseded,
  request,
  settle,
  settleValue,
  startAtJiraNow,
} from "./t3team-atlassian-mirrorSyncFakeJira.fixtures.ts";
import { runMirrorLoop } from "./t3team-atlassian-mirrorSyncLoop.ts";
import { clearMirrorProgress } from "./t3team-atlassian-mirrorSyncProgress.ts";
import {
  newMirrorRecentWindowState,
  runMirrorRecentWindowFirst,
} from "./t3team-atlassian-mirrorSyncRecentWindow.ts";
import {
  advanceT3TeamMirrorWatermark,
  readT3TeamMirrorSyncStatus,
  recordT3TeamMirrorCatchUp,
} from "./t3team-atlassian-mirrorSyncState.ts";
import { readCatchUpForAccount } from "./t3team-atlassian-syncCatchUp.ts";
import { readDigestJiraHealth } from "./t3team-myworkDigestJiraHealth.ts";

/** 25,000 issues untouched for months (250 pages: more than one walk's page cap). */
const oldIssues: ReadonlyArray<FakeIssue> = Array.from({ length: 25_000 }, (_, i) => ({
  id: `old-${i}`,
  displayId: `IES-${i}`,
  updatedAt: isoAt(jiraNowMs - 120 * dayMs + i * 1_000),
}));
/** 300 issues changed in the last 30 days, `recent-299` the newest. */
const recentIssues: ReadonlyArray<FakeIssue> = Array.from({ length: 300 }, (_, i) => ({
  id: `recent-${i}`,
  displayId: `IES-${25_000 + i}`,
  updatedAt: isoAt(jiraNowMs - 30 * dayMs + i * 60 * minuteMs),
}));
const allIssues = [...oldIssues, ...recentIssues];
const recentIds = recentIssues.map((issue) => issue.id);

const freshStart = Effect.gen(function* () {
  yield* startAtJiraNow;
  clearMirrorProgress(identity);
});

it.effect(
  "the recent window lands the newest tickets, page by page, without moving the watermark",
  () =>
    Effect.gen(function* () {
      yield* freshStart;
      const jira = fakeJira(allIssues);
      const state = newMirrorRecentWindowState();

      const outcome = yield* settleValue(
        runMirrorRecentWindowFirst(request, jira.source, identity, notSuperseded, state),
      );

      assert.strictEqual(outcome, "continue");
      assert.isTrue(state.done);
      assert.strictEqual(jira.calls.length, 3);
      assert.isTrue(jira.calls.every((call) => call.newestFirst));
      assert.isTrue(jira.calls.every((call) => call.updatedWithinMinutes === 45 * 24 * 60));
      const ids = yield* mirroredIds;
      assert.strictEqual(ids.size, recentIssues.length);
      assert.isTrue(recentIds.every((id) => ids.has(id)));

      const status = yield* readT3TeamMirrorSyncStatus(identity);
      assert.isUndefined(status.watermarkMs);
      assert.isUndefined(status.lastSuccessAtMs);
      const health = yield* readDigestJiraHealth(request, true);
      assert.isUndefined(health.jiraSyncedAt);
      assert.isTrue(
        health.jiraSyncPending,
        "the sync is still pending until the full catch-up ends",
      );
    }).pipe(Effect.provide(layerMemory)),
);

it.effect(
  "a failure mid-window keeps the newest pages and the next pass walks the window again",
  () =>
    Effect.gen(function* () {
      yield* freshStart;
      const state = newMirrorRecentWindowState();

      const failed = yield* settle(
        runMirrorRecentWindowFirst(
          request,
          fakeJira(allIssues, { failCall: 2 }).source,
          identity,
          notSuperseded,
          state,
        ),
      );

      assert.isTrue(Exit.isFailure(failed));
      assert.isFalse(state.done);
      const afterFailure = yield* mirroredIds;
      assert.deepStrictEqual(
        [...afterFailure].toSorted(),
        recentIds.slice(200).toSorted(),
        "the first page holds the newest 100 tickets",
      );
      assert.isUndefined((yield* readT3TeamMirrorSyncStatus(identity)).watermarkMs);

      yield* settleValue(
        runMirrorRecentWindowFirst(
          request,
          fakeJira(allIssues).source,
          identity,
          notSuperseded,
          state,
        ),
      );
      assert.isTrue(state.done);
      assert.strictEqual((yield* mirroredIds).size, recentIssues.length);
    }).pipe(Effect.provide(layerMemory)),
);

it.effect("a watermark inside the window skips the recent phase", () =>
  Effect.gen(function* () {
    yield* freshStart;
    yield* advanceT3TeamMirrorWatermark(identity, jiraNowMs - dayMs);
    const jira = fakeJira(allIssues);
    const state = newMirrorRecentWindowState();

    yield* settleValue(
      runMirrorRecentWindowFirst(request, jira.source, identity, notSuperseded, state),
    );

    assert.strictEqual(jira.calls.length, 0);
    assert.isTrue(state.done);
  }).pipe(Effect.provide(layerMemory)),
);

it.effect(
  "the loop lands recent tickets in a few pages and never lets the watermark pass unfetched data",
  () =>
    Effect.gen(function* () {
      yield* freshStart;
      const jira = fakeJira(allIssues);
      let stopped = false;
      const loop = yield* Effect.forkChild(
        runMirrorLoop(
          request,
          "recent-window-loop",
          () => stopped,
          () => Effect.succeed(jira.source),
        ),
      );

      let callsWhenRecentLanded: number | undefined;
      let sawProgress = false;
      let status = yield* readT3TeamMirrorSyncStatus(identity);
      for (let step = 0; step < 2_000 && status.lastSuccessAtMs === undefined; step++) {
        yield* TestClock.adjust("3 seconds");
        yield* TestClock.withLive(Effect.sleep("0 millis"));
        status = yield* readT3TeamMirrorSyncStatus(identity);
        const ids = yield* mirroredIds;
        if (callsWhenRecentLanded === undefined && recentIds.every((id) => ids.has(id))) {
          callsWhenRecentLanded = jira.calls.length;
          assert.isUndefined(status.lastSuccessAtMs);
        }
        const watermarkMs = status.watermarkMs;
        if (watermarkMs !== undefined) {
          const unfetched = allIssues.filter(
            (issue) => Date.parse(issue.updatedAt) <= watermarkMs && !ids.has(issue.id),
          );
          assert.strictEqual(unfetched.length, 0, "the watermark passed an issue not yet mirrored");
        }
        sawProgress ||= (readCatchUpForAccount(account.id)?.pagesWalked ?? 0) > 0;
      }
      stopped = true;
      yield* Fiber.interrupt(loop);

      assert.isDefined(callsWhenRecentLanded);
      assert.isAtMost(
        callsWhenRecentLanded ?? Number.POSITIVE_INFINITY,
        15,
        "recent tickets land within the first pages, not after the 250 pages of history",
      );
      assert.isAbove(jira.calls.length, 200, "the older history is still fully walked afterwards");
      assert.isTrue(sawProgress, "first-sync progress is visible while walking");
      assert.isDefined(status.lastSuccessAtMs);
      assert.strictEqual((yield* mirroredIds).size, allIssues.length);
      assert.isUndefined(readCatchUpForAccount(account.id), "progress ends with the sync");
    }).pipe(Effect.provide(layerMemory)),
);

it.effect("a loop with a fresh watermark walks only the incremental window, as before", () =>
  Effect.gen(function* () {
    yield* freshStart;
    yield* advanceT3TeamMirrorWatermark(identity, jiraNowMs - 60 * minuteMs);
    yield* recordT3TeamMirrorCatchUp(identity, jiraNowMs - 2 * 60 * minuteMs);
    const jira = fakeJira(recentIssues);
    let stopped = false;
    const loop = yield* Effect.forkChild(
      runMirrorLoop(
        request,
        "fresh-watermark-loop",
        () => stopped,
        () => Effect.succeed(jira.source),
      ),
    );

    for (let step = 0; step < 5; step++) {
      yield* TestClock.adjust("3 seconds");
      yield* TestClock.withLive(Effect.sleep("0 millis"));
    }
    stopped = true;
    yield* Fiber.interrupt(loop);

    assert.isAbove(jira.calls.length, 0);
    assert.isTrue(jira.calls.every((call) => !call.newestFirst));
    assert.isTrue(jira.calls.every((call) => (call.updatedWithinMinutes ?? 0) < 24 * 60));
    assert.isUndefined(readCatchUpForAccount(account.id));
  }).pipe(Effect.provide(layerMemory)),
);

it.effect("first-sync progress reports the pages walked and the change reached so far", () =>
  Effect.gen(function* () {
    yield* freshStart;
    const jira = fakeJira(allIssues);

    const outcome = yield* settleValue(
      runMirrorCatchUpWalk(request, jira.source, identity, notSuperseded),
    );

    assert.strictEqual(outcome, "more-pending");
    const progress = readCatchUpForAccount(account.id);
    assert.strictEqual(progress?.pagesWalked, 200);
    assert.isDefined(progress?.lastPageMs);
    assert.strictEqual(
      progress?.reachedAt,
      (yield* readT3TeamMirrorSyncStatus(identity)).watermarkMs,
    );
  }).pipe(Effect.provide(layerMemory)),
);
