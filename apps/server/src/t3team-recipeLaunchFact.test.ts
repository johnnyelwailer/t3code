import { assert, it } from "@effect/vitest";
import { T3TEAM_RECIPE_FACT_KEY, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { recordRecipeLaunchFact } from "./t3team-recipeLaunchFact.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";

const TestLayer = ThreadFactsStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
const threadId = ThreadId.make("thread:recipe-home");

it.layer(TestLayer)("t3team.recipe launch fact", (it) => {
  it.effect("records the latest recipe launched on a thread, beside other facts", () =>
    Effect.gen(function* () {
      const facts = yield* ThreadFactsStore.T3TeamThreadFactsStore;
      yield* facts.upsert(threadId, { extensions: { "acme.summary": { watched: 2 } } });
      yield* recordRecipeLaunchFact({
        threadId,
        runId: "run-1",
        recipe: { id: "pr-watch", version: "2.0.0", action: "" },
      });
      yield* recordRecipeLaunchFact({
        threadId,
        runId: "run-2",
        recipe: { id: "pr-watch", version: "2.0.1", action: "watch" },
      });
      const extensions = (yield* facts.get(threadId))?.extensions ?? {};
      assert.deepInclude(extensions[T3TEAM_RECIPE_FACT_KEY] as object, {
        id: "pr-watch",
        version: "2.0.1",
        runId: "run-2",
        action: "watch",
      });
      assert.deepStrictEqual(extensions["acme.summary"], { watched: 2 });
    }),
  );
});
