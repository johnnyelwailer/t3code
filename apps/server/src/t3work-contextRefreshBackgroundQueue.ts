import * as DateTime from "effect/DateTime";

import { sortT3workContextRefreshQueue } from "./t3work-context-refresh-priority.ts";
import { normalizeT3workJiraKey } from "./t3work-context-jira-relationships.ts";
import { t3workRandomUUID } from "./t3work-random.ts";

export const t3workContextBackgroundTargetDepth = 10;
export const t3workContextBackgroundOpportunisticMaxDepth = 25;

export type T3workContextBackgroundQueueItem = {
  readonly resourceKey: string;
  readonly depth: number;
  readonly enqueuedAt: number;
  readonly failureCount?: number;
};

export type T3workContextBackgroundJob = {
  readonly jobId: string;
  readonly rootKey: string;
  readonly queue: T3workContextBackgroundQueueItem[];
  readonly seen: Set<string>;
  running: boolean;
};

const activeJobs = new Map<string, T3workContextBackgroundJob>();

function jobKey(input: { readonly workspaceRoot: string; readonly rootKey: string }): string {
  return `${input.workspaceRoot}|${input.rootKey}`;
}

export function getT3workContextBackgroundJob(input: {
  readonly workspaceRoot: string;
  readonly rootKey: string;
  readonly jobId?: string;
}): T3workContextBackgroundJob {
  const key = jobKey(input);
  const job =
    activeJobs.get(key) ??
    ({
      jobId: input.jobId ?? t3workRandomUUID(),
      rootKey: input.rootKey,
      queue: [],
      seen: new Set<string>([input.rootKey]),
      running: false,
    } satisfies T3workContextBackgroundJob);
  activeJobs.set(key, job);
  return job;
}

export function sortT3workContextBackgroundQueue(job: T3workContextBackgroundJob): void {
  job.queue.splice(0, job.queue.length, ...sortT3workContextRefreshQueue(job.queue));
}

export function enqueueT3workContextBackgroundItems(
  job: T3workContextBackgroundJob,
  items: ReadonlyArray<{ readonly key: string; readonly depth: number }>,
): void {
  const now = DateTime.nowUnsafe().epochMilliseconds;
  for (const item of items) {
    const normalized = normalizeT3workJiraKey(item.key);
    if (
      !normalized ||
      job.seen.has(normalized) ||
      item.depth > t3workContextBackgroundOpportunisticMaxDepth
    ) {
      continue;
    }
    job.seen.add(normalized);
    job.queue.push({ resourceKey: normalized, depth: item.depth, enqueuedAt: now });
  }
  sortT3workContextBackgroundQueue(job);
}

export function listActiveT3workContextBackgroundJobs(): ReadonlyArray<T3workContextBackgroundJob> {
  return [...activeJobs.values()];
}

/**
 * Release a finished job from `activeJobs` so its queue + `seen` set (which
 * can grow large for wide dependency graphs) don't outlive the run forever.
 * Only removes the entry when it is genuinely idle (not running, empty
 * queue) and still the same job instance registered under this key — a kick
 * that raced in during teardown and replaced/reused the map entry is left
 * alone. A later kick for the same (workspaceRoot, rootKey) simply creates a
 * fresh job via `getT3workContextBackgroundJob`.
 */
export function releaseT3workContextBackgroundJobIfIdle(
  input: { readonly workspaceRoot: string; readonly rootKey: string },
  job: T3workContextBackgroundJob,
): void {
  if (job.running || job.queue.length > 0) return;
  const key = jobKey(input);
  if (activeJobs.get(key) === job) {
    activeJobs.delete(key);
  }
}
