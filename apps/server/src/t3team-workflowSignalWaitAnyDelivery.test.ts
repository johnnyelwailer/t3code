/**
 * The delivery port CORE for `waitForAny` parks (fakes, no database):
 *
 *   1. MATCH — an event on a NON-first branch of an any-wait park answers it with that branch's
 *      `{ index, reply }` winner, on the row's one parked correlation.
 *   2. RE-DECIDE — through `offer`, the answer is computed from the row as it is once any
 *      in-flight drive settled, not from the stale listing: an event that lost the race for one
 *      wait answers the wait the run parked on next.
 *   3. DECLINE — when that re-read finds the run no longer waiting on the tuple, the event is
 *      bridged to the inbox, once, however many runs declined it.
 */

import { anyWinner } from "@t3team/sdk";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { WorkflowRun } from "./persistence/WorkflowRuns.ts";
import type { InsertSignalInboxEntryInput } from "./persistence/WorkflowSignalStore.ts";
import type { WorkflowRegisteredRun } from "./t3team-workflowEngineRegistry.ts";
import { makeSignalDeliveryPort } from "./t3team-workflowSignalDelivery.ts";

const NOW = "2026-10-07T00:00:00.000Z";
const branch = (source: string, signal: string) => ({
  source,
  paramsHash: "h42",
  signal,
  key: "42",
});
const BRANCHES = [
  branch("scm.change-request.watch", "scm.change-request.merged"),
  branch("scm.change-request.watch", "scm.change-request.closed"),
  branch("scm.change-request.checks", "scm.change-request.checks.concluded"),
];
/** An any-wait row: the branch list, with branch 0 repeated in the single `watch_*` columns. */
const parked = (runId: string, correlationId: string, over: Partial<WorkflowRun> = {}) =>
  ({
    runId,
    status: "watching",
    pendingCorrelationId: correlationId,
    watchSourceName: BRANCHES[0]!.source,
    watchParamsHash: "h42",
    watchSignalName: BRANCHES[0]!.signal,
    watchSignalKey: "42",
    watchAny: BRANCHES,
    ...over,
  }) as unknown as WorkflowRun;
const event = (index: number, payload: unknown) => ({
  sourceName: BRANCHES[index]!.source,
  paramsHash: "h42",
  signalName: BRANCHES[index]!.signal,
  key: "42",
  payload,
});

function harness(listed: ReadonlyArray<WorkflowRun>, current: Map<string, WorkflowRun>) {
  const inserted: InsertSignalInboxEntryInput[] = [];
  const answered: Array<{ runId: string; correlationId: string; reply: unknown }> = [];
  const controller = (runId: string, mode: "resume" | "offer"): WorkflowRegisteredRun => ({
    resume: async (correlationId, reply) => void answered.push({ runId, correlationId, reply }),
    cancel: () => {},
    ...(mode === "offer"
      ? {
          offer: async (decide) => {
            const target = await decide();
            if (target === undefined) return false;
            answered.push({ runId, ...target });
            return true;
          },
        }
      : {}),
  });
  const port = (mode: "resume" | "offer") =>
    makeSignalDeliveryPort({
      repo: {
        listByStatus: () => Effect.succeed([...listed]),
        clearPending: () => Effect.succeed(undefined),
        getById: ({ runId }) => Effect.succeed(Option.fromNullishOr(current.get(runId))),
      },
      store: {
        insertInboxEntry: (input) => {
          inserted.push(input);
          return Effect.succeed(inserted.length);
        },
      },
      registry: { getRun: (runId) => controller(runId, mode) },
      nowIso: () => NOW,
    });
  return { port, inserted, answered };
}

describe("makeSignalDeliveryPort — waitForAny parks", () => {
  it.effect("answers a non-first branch with its index on the parked correlation", () =>
    Effect.gen(function* () {
      const row = parked("run-a", "run-a:4");
      const h = harness([row], new Map([["run-a", row]]));
      const payload = { changeRequest: { title: "Fix billing" }, conclusion: "success" };
      assert.strictEqual(yield* h.port("resume").emit(event(2, payload)), 1);
      assert.deepStrictEqual(h.answered, [
        { runId: "run-a", correlationId: "run-a:4", reply: anyWinner(2, payload) },
      ]);
      assert.deepStrictEqual(h.inserted, []);
    }),
  );

  it.effect("re-decides against the row the in-flight drive left, not the stale listing", () =>
    Effect.gen(function* () {
      // Listed while parked on :4; by the time the offer decides, the run parked again on :9.
      const h = harness(
        [parked("run-a", "run-a:4")],
        new Map([["run-a", parked("run-a", "run-a:9")]]),
      );
      assert.strictEqual(yield* h.port("offer").emit(event(1, { closed: true })), 1);
      assert.deepStrictEqual(h.answered, [
        { runId: "run-a", correlationId: "run-a:9", reply: anyWinner(1, { closed: true }) },
      ]);
      assert.deepStrictEqual(h.inserted, []);
    }),
  );

  it.effect("bridges the event to the inbox once when every matched run declines it", () =>
    Effect.gen(function* () {
      // run-a finished meanwhile; run-b is now parked on a wait that does not include merged.
      const elsewhere = parked("run-b", "run-b:7", { watchAny: [BRANCHES[2]!] });
      const h = harness(
        [parked("run-a", "run-a:4"), parked("run-b", "run-b:3")],
        new Map([
          ["run-a", parked("run-a", "run-a:4", { status: "completed" })],
          ["run-b", elsewhere],
        ]),
      );
      assert.strictEqual(yield* h.port("offer").emit(event(0, { merged: true })), 0);
      assert.deepStrictEqual(h.answered, []);
      assert.strictEqual(h.inserted.length, 1);
      assert.strictEqual(h.inserted[0]?.signalName, "scm.change-request.merged");
    }),
  );
});
