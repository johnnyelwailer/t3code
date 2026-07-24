import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { kickT3TeamContextBackgroundExpansion } from "./t3team-contextRefreshBackground.ts";
import {
  hydrateT3TeamContextBackgroundJob,
  persistT3TeamContextBackgroundJob,
} from "./t3team-contextRefreshBackgroundPersist.ts";
import { t3teamContextBackgroundTargetDepth } from "./t3team-contextRefreshBackgroundQueue.ts";
import { listIncompleteT3TeamContextRefreshJobs } from "./t3team-context-refresh-jobs.ts";
import { logBackgroundResume } from "./t3team-contextRefreshTelemetry.ts";
import { loadT3TeamContextRefreshScope } from "./t3team-contextRefreshScope.ts";

export function resumeIncompleteT3TeamContextBackgroundJobs() {
  return Effect.gen(function* () {
    const jobs = yield* listIncompleteT3TeamContextRefreshJobs();
    let resumedCount = 0;
    let completedCount = 0;
    let skippedCount = 0;
    for (const record of jobs) {
      const scope = yield* loadT3TeamContextRefreshScope({
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
      const job = yield* hydrateT3TeamContextBackgroundJob({
        workspaceRoot: record.workspaceRoot,
        rootKey: record.rootKey,
      });
      if (!job || job.queue.length === 0) {
        if (job) {
          yield* persistT3TeamContextBackgroundJob(job, {
            workspaceRoot: record.workspaceRoot,
            status: "completed",
            currentDepth: t3teamContextBackgroundTargetDepth,
          });
          completedCount += 1;
        } else {
          skippedCount += 1;
        }
        continue;
      }
      yield* kickT3TeamContextBackgroundExpansion({
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
      Effect.logDebug("t3team context background resume skipped", cause),
    ),
  );
}
