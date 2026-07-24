import * as Effect from "effect/Effect";

import { sumT3TeamContextBlobBytes } from "./t3team-context-blob-store-tables.ts";
import {
  isT3TeamContextCacheSoftPressure,
  readT3TeamContextCacheBudget,
} from "./t3team-context-cache-budget.ts";
import { reclaimT3TeamContextCacheIfNeeded } from "./t3team-context-cache-purge.ts";
import { logBackgroundBudgetPause } from "./t3team-contextRefreshTelemetry.ts";

const fallbackBudget = {
  hardStop: false,
  softBudgetBytes: Number.POSITIVE_INFINITY,
  reserveBytes: 0,
  freeBytes: Number.POSITIVE_INFINITY,
  totalBytes: 0,
};

export function shouldContinueT3TeamContextBackgroundRefresh(
  workspaceRoot: string,
  queueDepth = 0,
  rootKey = "",
) {
  return Effect.gen(function* () {
    const budget = yield* readT3TeamContextCacheBudget(workspaceRoot).pipe(
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
    const cacheBytes = yield* sumT3TeamContextBlobBytes();
    if (!isT3TeamContextCacheSoftPressure({ budget, cacheBytes })) {
      return true;
    }
    yield* reclaimT3TeamContextCacheIfNeeded({ workspaceRoot, budget });
    const afterPurge = yield* sumT3TeamContextBlobBytes();
    const continueAfterPurge = !isT3TeamContextCacheSoftPressure({
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
