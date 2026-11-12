/**
 * Durable claim → launch over the real launch ledger (in-memory SQLite). Every "restart" below is
 * a fresh launcher over the same database, which is all a crashed process leaves behind.
 */
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "./persistence/Sqlite.ts";
import { WorkflowSignalStore, WorkflowSignalStoreLive } from "./persistence/WorkflowSignalStore.ts";
import {
  WorkflowTriggerLaunchStore,
  WorkflowTriggerLaunchStoreLive,
} from "./persistence/t3team-WorkflowTriggerLaunchStore.ts";
import {
  makeRecipeTriggerLauncher,
  retryDelayMs,
  TRIGGER_LAUNCH_MAX_ATTEMPTS,
  type RecipeTriggerLauncherPorts,
} from "./t3team-recipeTriggerLauncher.ts";
import { makeTriggerRunnerAmbient } from "./t3team-recipeTriggerRunnerAmbient.ts";
import { makeTriggerLauncherPorts } from "./t3team-recipeTriggerRunnerPorts.ts";

const layer = Layer.mergeAll(WorkflowSignalStoreLive, WorkflowTriggerLaunchStoreLive).pipe(
  Layer.provideMerge(SqlitePersistence.layerMemory),
);

const T0 = Date.parse("2026-10-23T10:00:00.000Z");
const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));
const tuple = { sourceName: "scm.project.items", paramsHash: "h", signalName: "s" };

/** One process's launcher over the shared database: the production ledger adapter, with a fake
 * clock, a fake run table, and a fake headless launch. */
const makeProcess = Effect.fn(function* (input: {
  readonly clock: { now: number };
  readonly runs: Set<string>;
  readonly start: RecipeTriggerLauncherPorts["start"];
}) {
  const ports = makeTriggerLauncherPorts({
    ledger: yield* WorkflowTriggerLaunchStore,
    runs: {
      getById: ({ runId }: { runId: string }) =>
        Effect.succeed(input.runs.has(runId) ? Option.some(runId) : Option.none()),
    } as never,
    ambient: makeTriggerRunnerAmbient(yield* Effect.context<never>()),
    liveTriggers: () => [],
    nowMs: () => input.clock.now,
  });
  return makeRecipeTriggerLauncher({ ...ports, start: input.start });
});

const seedAndClaim = Effect.fn(function* (launchId: string, at = T0) {
  const inbox = yield* WorkflowSignalStore;
  const ledger = yield* WorkflowTriggerLaunchStore;
  const id = yield* inbox.insertInboxEntry({
    ...tuple,
    key: "o/r#1",
    payload: {},
    createdAt: iso(at),
  });
  return yield* ledger.claim({
    ...tuple,
    key: "o/r#1",
    upToId: id,
    launchId,
    projectId: "p1",
    recipeId: "triage",
    triggerId: "ghe",
    args: { key: "o/r#1" },
    claimedAt: iso(at),
  });
});

const statusOf = Effect.fn(function* (launchId: string) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ status: string; attempts: number }>`
    SELECT status, attempts FROM workflow_signal_trigger_launches WHERE launch_id = ${launchId}`;
  return rows[0];
});

describe("recipe trigger launch ledger", () => {
  it.effect("claims atomically: the inbox slot and the pending launch commit together, once", () =>
    Effect.gen(function* () {
      assert.isTrue(yield* seedAndClaim("L1"));
      const ledger = yield* WorkflowTriggerLaunchStore;
      const again = yield* ledger.claim({
        ...tuple,
        key: "o/r#1",
        upToId: 1,
        launchId: "L2",
        projectId: "p1",
        recipeId: "triage",
        triggerId: "ghe",
        args: {},
        claimedAt: iso(T0),
      });
      assert.isFalse(again);
      assert.deepStrictEqual(yield* statusOf("L1"), { status: "pending", attempts: 0 });
      assert.isUndefined(yield* statusOf("L2"));
      const inbox = yield* WorkflowSignalStore;
      yield* inbox.insertInboxEntry({
        ...tuple,
        key: "o/r#2",
        payload: {},
        createdAt: iso(T0 + 5),
      });
      assert.deepStrictEqual(yield* ledger.inboxSummary(tuple), {
        lastEventAt: iso(T0 + 5),
        undelivered: 1,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("a crash between claim and launch is launched by the next process, once", () =>
    Effect.gen(function* () {
      yield* seedAndClaim("L1");
      const clock = { now: T0 + 1_000 };
      const started: string[] = [];
      const runs = new Set<string>();
      const next = yield* makeProcess({
        clock,
        runs,
        start: async (req, admit) => {
          started.push(req.launchId);
          runs.add(req.launchId);
          await admit();
        },
      });
      yield* Effect.promise(() => next.retryDue());
      yield* Effect.promise(() => next.retryDue());
      assert.deepStrictEqual(started, ["L1"]);
      assert.strictEqual((yield* statusOf("L1"))?.status, "launched");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("a crash after the run row was written never launches a second run", () =>
    Effect.gen(function* () {
      yield* seedAndClaim("L1");
      const started: string[] = [];
      const next = yield* makeProcess({
        clock: { now: T0 + 1_000 },
        runs: new Set(["L1"]),
        start: async (req) => void started.push(req.launchId),
      });
      yield* Effect.promise(() => next.retryDue());
      assert.deepStrictEqual(started, []);
      assert.strictEqual((yield* statusOf("L1"))?.status, "launched");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("retries a failing launch with backoff, then settles it as failed", () =>
    Effect.gen(function* () {
      yield* seedAndClaim("L1");
      const clock = { now: T0 };
      let starts = 0;
      const process = yield* makeProcess({
        clock,
        runs: new Set(),
        start: async () => {
          starts += 1;
          throw new Error("workflow file missing");
        },
      });
      for (let attempt = 0; attempt < TRIGGER_LAUNCH_MAX_ATTEMPTS; attempt += 1) {
        yield* Effect.promise(() => process.retryDue());
        assert.strictEqual(starts, attempt + 1);
        yield* Effect.promise(() => process.retryDue()); // not due yet: backoff holds it
        assert.strictEqual(starts, attempt + 1);
        clock.now += retryDelayMs(attempt);
      }
      assert.deepStrictEqual(yield* statusOf("L1"), {
        status: "failed",
        attempts: TRIGGER_LAUNCH_MAX_ATTEMPTS,
      });
      yield* Effect.promise(() => process.retryDue());
      assert.strictEqual(starts, TRIGGER_LAUNCH_MAX_ATTEMPTS);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("reads the limits back after a restart; a given-up launch frees the cap", () =>
    Effect.gen(function* () {
      const ledger = yield* WorkflowTriggerLaunchStore;
      yield* seedAndClaim("L1", T0);
      const read = () =>
        ledger.history({
          recipeId: "triage",
          triggerId: "ghe",
          windowStartIso: iso(T0 - 1_000),
          intervalStartIso: iso(T0 - 1_000),
        });
      const before = yield* read();
      assert.strictEqual(before.inFlight, 1);
      assert.strictEqual(before.launchesInWindow, 1);
      assert.strictEqual(before.lastClaimAtByKey.get("o/r#1"), iso(T0));

      yield* ledger.markAttemptFailed({
        launchId: "L1",
        error: "boom",
        nextAttemptAt: iso(T0),
        giveUp: true,
      });
      const after = yield* read();
      assert.strictEqual(after.inFlight, 0);
      assert.strictEqual(after.launchesInWindow, 0);
    }).pipe(Effect.provide(layer)),
  );
});
