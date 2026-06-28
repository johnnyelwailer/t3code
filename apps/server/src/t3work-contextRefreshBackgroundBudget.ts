import * as Effect from "effect/Effect";

import { sumT3workContextBlobBytes } from "./t3work-context-blob-store-tables.ts";
import {
  isT3workContextCacheSoftPressure,
  readT3workContextCacheBudget,
} from "./t3work-context-cache-budget.ts";
import { reclaimT3workContextCacheIfNeeded } from "./t3work-context-cache-purge.ts";
import { logBackgroundBudgetPause } from "./t3work-contextRefreshTelemetry.ts";

const fallbackBudget = {
  hardStop: false,
  softBudgetBytes: Number.POSITIVE_INFINITY,
  reserveBytes: 0,
  freeBytes: Number.POSITIVE_INFINITY,
  totalBytes: 0,
};

export function shouldContinueT3workContextBackgroundRefresh(
  workspaceRoot: string,
  queueDepth = 0,
  rootKey = "",
) {
  return Effect.gen(function* () {
    const budget = yield* readT3workContextCacheBudget(workspaceRoot).pipe(
      Effect.orElseSucceed(() => fallbackBudget),
    );
    if (budget.hardStop) {
      yield* logBackgroundBudgetPause({
        rootKey,
        reason: "hardStop",
        queueDepth,
        softBudgetBytes: budget.softBudgetBytes,
      });
      return false;
    }
    const cacheBytes = yield* sumT3workContextBlobBytes();
    if (!isT3workContextCacheSoftPressure({ budget, cacheBytes })) {
      return true;
    }
    yield* reclaimT3workContextCacheIfNeeded({ workspaceRoot, budget });
    const afterPurge = yield* sumT3workContextBlobBytes();
    const continueAfterPurge = !isT3workContextCacheSoftPressure({
      budget,
      cacheBytes: afterPurge,
    });
    if (!continueAfterPurge) {
      yield* logBackgroundBudgetPause({
        rootKey,
        reason: "softPressure",
        queueDepth,
        cacheBytes: afterPurge,
        softBudgetBytes: budget.softBudgetBytes,
      });
    }
    return continueAfterPurge;
  });
}
