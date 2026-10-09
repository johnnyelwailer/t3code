/**
 * The `t3team.recipe` launch fact: written on a thread when a recipe's workflow launches there,
 * so a client finds "this recipe's run" by recipe id (a card's toggle) from the thread facts it
 * already streams. The latest launch on the thread wins.
 */
import {
  T3TEAM_RECIPE_FACT_KEY,
  type T3TeamRecipeLaunchFact,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

export const recordRecipeLaunchFact = Effect.fn("recordRecipeLaunchFact")(function* (input: {
  readonly threadId: ThreadId;
  readonly runId: string;
  readonly recipe: {
    readonly id: string;
    readonly version?: string | undefined;
    readonly action?: string | undefined;
  };
}) {
  const facts = yield* T3TeamThreadFactsStore;
  const fact: T3TeamRecipeLaunchFact = {
    id: input.recipe.id,
    version: input.recipe.version?.trim() || null,
    runId: input.runId,
    action: input.recipe.action?.trim() || null,
    launchedAt: DateTime.formatIso(yield* DateTime.now),
  };
  yield* facts.upsert(input.threadId, { extensions: { [T3TEAM_RECIPE_FACT_KEY]: fact } });
});
