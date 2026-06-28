import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { kickT3workContextBackgroundExpansion } from "./t3work-contextRefreshBackground.ts";
import {
  hydrateT3workContextBackgroundJob,
  persistT3workContextBackgroundJob,
} from "./t3work-contextRefreshBackgroundPersist.ts";
import { t3workContextBackgroundTargetDepth } from "./t3work-contextRefreshBackgroundQueue.ts";
import { listIncompleteT3workContextRefreshJobs } from "./t3work-context-refresh-jobs.ts";
import { logBackgroundResume } from "./t3work-contextRefreshTelemetry.ts";
import { loadT3workContextRefreshScope } from "./t3work-contextRefreshScope.ts";

export function resumeIncompleteT3workContextBackgroundJobs() {
  return Effect.gen(function* () {
    const jobs = yield* listIncompleteT3workContextRefreshJobs();
    let resumedCount = 0;
    let completedCount = 0;
    let skippedCount = 0;
    for (const record of jobs) {
      const scope = yield* loadT3workContextRefreshScope({
        workspaceRoot: record.workspaceRoot,
        requestedKey: record.rootKey,
        projectId: "",
        force: false,
      }).pipe(Effect.option);
      if (Option.isNone(scope) || !scope.value.project.source.accountId) {
        skippedCount += 1;
        continue;
      }
      const provider = yield* providerForAccount(scope.value.project.source.accountId).pipe(
        Effect.option,
      );
      if (Option.isNone(provider)) {
        skippedCount += 1;
        continue;
      }
      const job = yield* hydrateT3workContextBackgroundJob({
        workspaceRoot: record.workspaceRoot,
        rootKey: record.rootKey,
      });
      if (!job || job.queue.length === 0) {
        if (job) {
          yield* persistT3workContextBackgroundJob(job, {
            workspaceRoot: record.workspaceRoot,
            status: "completed",
            currentDepth: t3workContextBackgroundTargetDepth,
          });
          completedCount += 1;
        } else {
          skippedCount += 1;
        }
        continue;
      }
      yield* kickT3workContextBackgroundExpansion({
        project: scope.value.project,
        provider: provider.value,
        workspaceRoot: record.workspaceRoot,
        rootKey: record.rootKey,
        seeds: [],
      });
      resumedCount += 1;
    }
    if (jobs.length > 0) {
      yield* logBackgroundResume({ resumedCount, completedCount, skippedCount });
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3work context background resume skipped", cause),
    ),
  );
}
