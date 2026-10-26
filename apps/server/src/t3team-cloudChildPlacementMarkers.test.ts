import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { makeSqlCloudChildPlacementMarkers } from "./t3team-cloudChildPlacementMarkers.ts";

describe("makeSqlCloudChildPlacementMarkers", () => {
  it.effect("records a placement once: a later write never rewrites it", () =>
    Effect.gen(function* () {
      const markers = yield* makeSqlCloudChildPlacementMarkers;
      const child = ThreadId.make("thread-child");
      assert.isUndefined(yield* markers.read(child));
      yield* markers.record(child, { sessionId: "run-41", repositoryKey: "ghe/pj/qa" });
      yield* markers.record(child, { sessionId: "run-77", repositoryKey: "ghe/foo/other" });
      assert.deepStrictEqual(yield* markers.read(child), {
        sessionId: "run-41",
        repositoryKey: "ghe/pj/qa",
      });
    }).pipe(Effect.provide(SqlitePersistenceMemory)),
  );
});
