import * as Effect from "effect/Effect";

import {
  loadT3TeamContextRefreshJob,
  loadT3TeamContextRefreshJobQueue,
  loadT3TeamContextRefreshJobSeen,
  listIncompleteT3TeamContextRefreshJobs,
  replaceT3TeamContextRefreshJobQueue,
  replaceT3TeamContextRefreshJobSeen,
  upsertT3TeamContextRefreshJob,
} from "./t3team-context-refresh-jobs.ts";
import {
  getT3TeamContextBackgroundJob,
  t3teamContextBackgroundOpportunisticMaxDepth,
  type T3TeamContextBackgroundJob,
} from "./t3team-contextRefreshBackgroundQueue.ts";

export function persistT3TeamContextBackgroundJobBestEffort(
  job: T3TeamContextBackgroundJob,
  workspaceRoot: string,
  status: "pending" | "running" | "completed",
) {
  return persistT3TeamContextBackgroundJob(job, { workspaceRoot, status }).pipe(
    Effect.catch(() => Effect.void),
  );
}

export function persistT3TeamContextBackgroundJob(
  job: T3TeamContextBackgroundJob,
  input: {
    readonly workspaceRoot: string;
    readonly status: "pending" | "running" | "completed";
    readonly currentDepth?: number;
  },
) {
  return Effect.gen(function* () {
    yield* upsertT3TeamContextRefreshJob({
      jobId: job.jobId,
      rootKey: job.rootKey,
      workspaceRoot: input.workspaceRoot,
      status: input.status,
      maxDepth: t3teamContextBackgroundOpportunisticMaxDepth,
      currentDepth: input.currentDepth ?? job.queue[0]?.depth ?? 0,
    });
    yield* replaceT3TeamContextRefreshJobQueue({ jobId: job.jobId, queue: job.queue });
    yield* replaceT3TeamContextRefreshJobSeen({
      jobId: job.jobId,
      seen: [...job.seen],
    });
  });
}

export function hydrateT3TeamContextBackgroundJob(input: {
  readonly workspaceRoot: string;
  readonly rootKey: string;
}) {
  return Effect.gen(function* () {
    const incomplete = yield* listIncompleteT3TeamContextRefreshJobs();
    const match = incomplete.find(
      (job) => job.workspaceRoot === input.workspaceRoot && job.rootKey === input.rootKey,
    );
    if (!match) {
      return undefined;
    }
    const queue = yield* loadT3TeamContextRefreshJobQueue(match.jobId);
    const seen = yield* loadT3TeamContextRefreshJobSeen(match.jobId);
    const job = getT3TeamContextBackgroundJob({
      workspaceRoot: input.workspaceRoot,
      rootKey: input.rootKey,
      jobId: match.jobId,
    });
    job.queue.splice(0, job.queue.length, ...queue);
    job.seen.clear();
    for (const key of seen) {
      job.seen.add(key);
    }
    job.running = match.status === "running";
    return job;
  });
}

export function loadT3TeamContextBackgroundJobRecord(jobId: string) {
  return loadT3TeamContextRefreshJob(jobId);
}
