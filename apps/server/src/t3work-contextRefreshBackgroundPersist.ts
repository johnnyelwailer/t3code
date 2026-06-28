import * as Effect from "effect/Effect";

import {
  loadT3workContextRefreshJob,
  loadT3workContextRefreshJobQueue,
  loadT3workContextRefreshJobSeen,
  listIncompleteT3workContextRefreshJobs,
  replaceT3workContextRefreshJobQueue,
  replaceT3workContextRefreshJobSeen,
  upsertT3workContextRefreshJob,
} from "./t3work-context-refresh-jobs.ts";
import {
  getT3workContextBackgroundJob,
  t3workContextBackgroundOpportunisticMaxDepth,
  type T3workContextBackgroundJob,
} from "./t3work-contextRefreshBackgroundQueue.ts";

export function persistT3workContextBackgroundJobBestEffort(
  job: T3workContextBackgroundJob,
  workspaceRoot: string,
  status: "pending" | "running" | "completed",
) {
  return persistT3workContextBackgroundJob(job, { workspaceRoot, status }).pipe(
    Effect.catch(() => Effect.void),
  );
}

export function persistT3workContextBackgroundJob(
  job: T3workContextBackgroundJob,
  input: {
    readonly workspaceRoot: string;
    readonly status: "pending" | "running" | "completed";
    readonly currentDepth?: number;
  },
) {
  return Effect.gen(function* () {
    yield* upsertT3workContextRefreshJob({
      jobId: job.jobId,
      rootKey: job.rootKey,
      workspaceRoot: input.workspaceRoot,
      status: input.status,
      maxDepth: t3workContextBackgroundOpportunisticMaxDepth,
      currentDepth: input.currentDepth ?? job.queue[0]?.depth ?? 0,
    });
    yield* replaceT3workContextRefreshJobQueue({ jobId: job.jobId, queue: job.queue });
    yield* replaceT3workContextRefreshJobSeen({
      jobId: job.jobId,
      seen: [...job.seen],
    });
  });
}

export function hydrateT3workContextBackgroundJob(input: {
  readonly workspaceRoot: string;
  readonly rootKey: string;
}) {
  return Effect.gen(function* () {
    const incomplete = yield* listIncompleteT3workContextRefreshJobs();
    const match = incomplete.find(
      (job) => job.workspaceRoot === input.workspaceRoot && job.rootKey === input.rootKey,
    );
    if (!match) {
      return undefined;
    }
    const queue = yield* loadT3workContextRefreshJobQueue(match.jobId);
    const seen = yield* loadT3workContextRefreshJobSeen(match.jobId);
    const job = getT3workContextBackgroundJob({
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

export function loadT3workContextBackgroundJobRecord(jobId: string) {
  return loadT3workContextRefreshJob(jobId);
}
