import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import * as ServerActivation from "./serverActivation.ts";
import { forkParkedHousekeeping, HOUSEKEEPING_STARTUP_GRACE } from "./t3team-housekeepingGrace.ts";

const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, { discard: true });

it.effect("holds housekeeping for the startup grace after activation", () =>
  Effect.gen(function* () {
    const activation = yield* Deferred.make<void>();
    const housekeepingRan = yield* Ref.make(false);
    const regularRan = yield* Ref.make(false);

    yield* Effect.gen(function* () {
      yield* forkParkedHousekeeping(Ref.set(housekeepingRan, true));
      yield* ServerActivation.forkParked(Ref.set(regularRan, true));
    }).pipe(Effect.provideService(ServerActivation.ServerActivation, Deferred.await(activation)));

    yield* Deferred.succeed(activation, undefined);
    yield* settle;
    assert.isTrue(yield* Ref.get(regularRan));
    assert.isFalse(yield* Ref.get(housekeepingRan));

    yield* TestClock.adjust(Duration.subtract(HOUSEKEEPING_STARTUP_GRACE, Duration.seconds(1)));
    yield* settle;
    assert.isFalse(yield* Ref.get(housekeepingRan));

    yield* TestClock.adjust(Duration.seconds(1));
    yield* settle;
    assert.isTrue(yield* Ref.get(housekeepingRan));
  }).pipe(Effect.scoped),
);

it.effect("runs housekeeping at once without an activation gate", () =>
  Effect.gen(function* () {
    const ran = yield* Ref.make(false);
    yield* forkParkedHousekeeping(Ref.set(ran, true));
    yield* settle;
    assert.isTrue(yield* Ref.get(ran));
  }).pipe(Effect.scoped),
);
