import { assert, it } from "@effect/vitest";
import { CommandId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import {
  combineSettleGuards,
  T3TeamSettleGuard,
  type T3TeamSettleGuardInput,
} from "./t3team-settleGuard.ts";
import { createTestThread, makeT3TeamV2TestLayer } from "./t3team-v2Orchestrator.testkit.ts";

const blocked = ThreadId.make("thread:settle-blocked");
const seen: Array<T3TeamSettleGuardInput> = [];
const guard = Layer.succeed(T3TeamSettleGuard, {
  check: combineSettleGuards(
    (input) => Effect.sync(() => void seen.push(input)).pipe(Effect.as(null)),
    (input) => Effect.succeed(input.threadId === blocked ? "a workflow run is live" : null),
  ),
});

it.layer(makeT3TeamV2TestLayer("t3team-settle-guard", guard))("T3TeamSettleGuard", (it) => {
  it.effect("rejects guarded settles and reports the settle origin", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const free = ThreadId.make("thread:settle-free");
      yield* createTestThread(blocked);
      yield* createTestThread(free);

      const rejected = yield* Effect.exit(
        orchestrator.dispatch({
          type: "thread.settle",
          commandId: CommandId.make("settle:blocked"),
          threadId: blocked,
        }),
      );
      assert.strictEqual(rejected._tag, "Failure");
      assert.isNull((yield* projections.getThread(blocked)).settledOverride);

      const snapshotAt = (yield* projections.getThread(free)).updatedAt;
      yield* orchestrator.dispatch({
        type: "thread.auto-settle",
        commandId: CommandId.make("server:auto-settle:free"),
        threadId: free,
        snapshotAt,
        settledAt: yield* DateTime.now,
      });
      assert.strictEqual((yield* projections.getThread(free)).settledOverride, "settled");
      assert.deepStrictEqual(
        seen.map((input) => [input.threadId, input.origin]),
        [
          [blocked, "user"],
          [free, "server"],
        ],
      );
    }),
  );
});
