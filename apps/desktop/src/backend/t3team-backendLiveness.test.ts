import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { makeBackendLiveness, recordBackendLivenessStream } from "./t3team-backendLiveness.ts";

const lines = (...text: ReadonlyArray<string>) =>
  Stream.make(...text.map((line) => new TextEncoder().encode(`${line}\n`)));

describe("backend liveness", () => {
  it.effect("is silent until a beacon arrives", () =>
    Effect.gen(function* () {
      const liveness = yield* makeBackendLiveness();
      assert.deepStrictEqual(yield* liveness.assess, { kind: "no-signal" });
    }),
  );

  it.effect("reads a recent multi-second stall as busy and a turning loop as wedged", () =>
    Effect.gen(function* () {
      const liveness = yield* makeBackendLiveness();
      yield* recordBackendLivenessStream(
        lines('{"version":1,"stalledForMs":250,"maxStallMs":18577}'),
        liveness,
      );
      assert.deepStrictEqual(yield* liveness.assess, { kind: "busy", maxStallMs: 18_577 });

      yield* recordBackendLivenessStream(
        lines('{"version":1,"stalledForMs":20,"maxStallMs":300}'),
        liveness,
      );
      assert.deepStrictEqual(yield* liveness.assess, { kind: "wedged", maxStallMs: 300 });
    }),
  );

  it.effect("counts the stall still in progress", () =>
    Effect.gen(function* () {
      const liveness = yield* makeBackendLiveness();
      yield* liveness.record({ version: 1, stalledForMs: 4_000, maxStallMs: 3_750 });
      assert.deepStrictEqual(yield* liveness.assess, { kind: "busy", maxStallMs: 4_000 });
    }),
  );

  it.effect("reads beacons that stopped arriving as a frozen process", () =>
    Effect.gen(function* () {
      const liveness = yield* makeBackendLiveness();
      yield* liveness.record({ version: 1, stalledForMs: 0, maxStallMs: 18_000 });
      yield* TestClock.adjust(Duration.seconds(6));
      assert.deepStrictEqual(yield* liveness.assess, { kind: "frozen", beaconAgeMs: 6_000 });
    }),
  );

  it.effect("skips malformed lines and keeps the last good beacon", () =>
    Effect.gen(function* () {
      const liveness = yield* makeBackendLiveness();
      yield* recordBackendLivenessStream(
        lines('{"version":1,"stalledForMs":0,"maxStallMs":2000}', "not json", '{"version":2}'),
        liveness,
      );
      assert.deepStrictEqual(yield* liveness.assess, { kind: "busy", maxStallMs: 2_000 });
    }),
  );
});
