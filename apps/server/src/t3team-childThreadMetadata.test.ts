import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  T3TeamChildThreadMetadata,
  T3TeamChildThreadMetadataLive,
} from "./t3team-childThreadMetadata.ts";

const TestLayer = T3TeamChildThreadMetadataLive.pipe(Layer.provideMerge(SqlitePersistenceMemory));

it.layer(TestLayer)("T3TeamChildThreadMetadata", (it) => {
  it.effect("upserts per child and lists by child ids", () =>
    Effect.gen(function* () {
      const store = yield* T3TeamChildThreadMetadata;
      const child = ThreadId.make("thread:child-a");
      yield* store.upsert({
        childThreadId: child,
        parentThreadId: ThreadId.make("thread:parent"),
        ticketId: "T-1",
      });
      yield* store.upsert({
        childThreadId: child,
        parentThreadId: ThreadId.make("thread:parent"),
        placementThreadId: "thread:launcher",
        ticketId: "T-2",
      });
      const rows = yield* store.listByChildThreadIds([child, "thread:unknown"]);
      assert.strictEqual(rows.length, 1);
      assert.include(rows[0], {
        childThreadId: child,
        parentThreadId: "thread:parent",
        placementThreadId: "thread:launcher",
        ticketId: "T-2",
        skills: null,
      });
      assert.deepEqual(yield* store.listByChildThreadIds([]), []);
    }),
  );

  it.effect("round-trips the requested skill names and clears them on the next upsert", () =>
    Effect.gen(function* () {
      const store = yield* T3TeamChildThreadMetadata;
      const child = ThreadId.make("thread:child-skills");
      yield* store.upsert({
        childThreadId: child,
        parentThreadId: ThreadId.make("thread:parent"),
        skills: ["deploy-staging", "review-fixes"],
      });
      const named = yield* store.listByChildThreadIds([child]);
      assert.deepEqual(named[0]?.skills, ["deploy-staging", "review-fixes"]);
      yield* store.upsert({
        childThreadId: child,
        parentThreadId: ThreadId.make("thread:parent"),
      });
      const cleared = yield* store.listByChildThreadIds([child]);
      assert.equal(cleared[0]?.skills, null);
    }),
  );
});
