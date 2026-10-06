import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  T3TeamChildThreadMetadata,
  T3TeamChildThreadMetadataLive,
} from "./t3team-childThreadMetadata.ts";
import { loadT3TeamThreadPlacements } from "./t3team-thread-placement-routes.ts";
import {
  T3TeamThreadToolContextStore,
  T3TeamThreadToolContextStoreLive,
} from "./t3team-threadToolContextStore.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";

const TestLayer = Layer.mergeAll(
  T3TeamChildThreadMetadataLive,
  ThreadFactsStore.layer,
  T3TeamThreadToolContextStoreLive,
).pipe(Layer.provideMerge(SqlitePersistenceMemory));

const ticketToolContext = (ticketId: string) =>
  ({
    surface: "t3team",
    tools: [],
    state: { view: { kind: "thread", ticketId } },
  }) as never;

it.layer(TestLayer)("loadT3TeamThreadPlacements (V2)", (it) => {
  it.effect("reads ticket + visible placement from child metadata and tool context", () =>
    Effect.gen(function* () {
      const metadata = yield* T3TeamChildThreadMetadata;
      const facts = yield* ThreadFactsStore.T3TeamThreadFactsStore;
      const toolContexts = yield* T3TeamThreadToolContextStore;
      const parent = ThreadId.make("parent");
      yield* metadata.upsert({
        childThreadId: ThreadId.make("child-ticket"),
        parentThreadId: parent,
        ticketId: "PROJ-42",
      });
      yield* metadata.upsert({
        childThreadId: ThreadId.make("child-placed"),
        parentThreadId: ThreadId.make("hidden-helper"),
        placementThreadId: "launcher",
      });
      yield* metadata.upsert({
        childThreadId: ThreadId.make("child-ephemeral"),
        parentThreadId: parent,
        ticketId: "PROJ-1",
      });
      yield* facts.upsert(ThreadId.make("child-ephemeral"), { retention: "ephemeral" });
      yield* toolContexts.put({
        threadId: ThreadId.make("root-from-ticket"),
        toolContext: ticketToolContext("PROJ-7"),
      });

      const placements = yield* loadT3TeamThreadPlacements([
        "child-ticket",
        "child-placed",
        "child-ephemeral",
        "root-from-ticket",
        "unknown-thread",
      ]);

      assert.deepStrictEqual(placements, [
        { threadId: "child-ticket", parentThreadId: "parent", ticketId: "PROJ-42" },
        { threadId: "child-placed", parentThreadId: "launcher" },
        { threadId: "root-from-ticket", ticketId: "PROJ-7" },
      ]);
    }),
  );

  it.effect("handles more ids than one bound-parameter chunk", () =>
    Effect.gen(function* () {
      const metadata = yield* T3TeamChildThreadMetadata;
      yield* metadata.upsert({
        childThreadId: ThreadId.make("thread-999"),
        parentThreadId: ThreadId.make("parent"),
      });
      const ids = Array.from({ length: 1000 }, (_, index) => `thread-${index}`);
      const placements = yield* loadT3TeamThreadPlacements(ids);
      assert.deepStrictEqual(placements, [{ threadId: "thread-999", parentThreadId: "parent" }]);
    }),
  );
});
