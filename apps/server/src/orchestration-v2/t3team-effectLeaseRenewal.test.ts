import { assert, it } from "@effect/vitest";
import { CommandId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as EffectOutbox from "./EffectOutbox.ts";

const layerTest = Layer.fresh(
  EffectOutbox.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)),
);

it.effect("keeps a long effect's lease alive so it is not claimed twice", () =>
  Effect.gen(function* () {
    const outbox = yield* EffectOutbox.EffectOutboxV2;
    const effectId = "effect:lease-renewal";
    yield* outbox.enqueue([
      {
        id: effectId,
        commandId: CommandId.make("command:lease-renewal"),
        threadId: ThreadId.make("thread:lease-renewal"),
        request: { type: "provider-turn.start", runId: RunId.make("run:lease-renewal") },
      },
    ]);
    const claimed = yield* outbox.claimNext({ workerId: "worker-a", leaseDurationMs: 1 });
    assert.isTrue(Option.isSome(claimed));
    // Only the lease owner can renew; a renewal pushes expiry far ahead.
    assert.isFalse(
      yield* outbox.renewLease({ effectId, workerId: "worker-b", leaseDurationMs: 60_000 }),
    );
    assert.isTrue(
      yield* outbox.renewLease({ effectId, workerId: "worker-a", leaseDurationMs: 60_000 }),
    );
    yield* TestClock.adjust("5 millis");
    // The 1ms claim lease has passed, but the renewed lease still holds.
    const reclaimed = yield* outbox.claimNext({ workerId: "worker-b", leaseDurationMs: 30_000 });
    assert.isTrue(Option.isNone(reclaimed));
    assert.isTrue(yield* outbox.succeed({ effectId, workerId: "worker-a" }));
  }).pipe(Effect.provide(layerTest)),
);
