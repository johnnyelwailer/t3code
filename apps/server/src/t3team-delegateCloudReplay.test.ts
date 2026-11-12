import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import { MODEL } from "./t3team-delegateCloud.fixtures.ts";
import { makeCloudPlacementReplays } from "./t3team-delegateCloudReplay.ts";

const record = {
  sessionId: "41",
  repositoryKey: "nexplore.ghe.com/pj/nexi-machine-qa",
  modelSelection: MODEL,
  note: "The child runs on cloud session 41.",
};

describe("makeCloudPlacementReplays", () => {
  it.effect("an interrupted placement does not strand its request key", () =>
    Effect.gen(function* () {
      const replays = yield* makeCloudPlacementReplays;
      const runs = yield* Ref.make(0);
      const hung = yield* Effect.forkChild(
        replays.once(
          "request-1",
          Ref.update(runs, (count) => count + 1).pipe(Effect.andThen(Effect.never)),
        ),
      );
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(hung);
      const again = yield* replays.once("request-1", Effect.succeed(record));
      assert.isTrue(again.fresh);
      assert.deepStrictEqual(again.record, record);
      assert.strictEqual(yield* Ref.get(runs), 1);
    }),
  );
});
