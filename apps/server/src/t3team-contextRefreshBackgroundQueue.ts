import * as DateTime from "effect/DateTime";

import { sortT3TeamContextRefreshQueue } from "./t3team-context-refresh-priority.ts";
import { normalizeT3TeamJiraKey } from "./t3team-context-jira-relationships.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export const t3teamContextBackgroundTargetDepth = 10;
export const t3teamContextBackgroundOpportunisticMaxDepth = 25;

export type T3TeamContextBackgroundQueueItem = {
  readonly resourceKey: string;
  readonly depth: number;
  readonly enqueuedAt: number;
  readonly failureCount?: number;
};

export type T3TeamContextBackgroundJob = {
  readonly jobId: string;
  readonly rootKey: string;
  readonly queue: T3TeamContextBackgroundQueueItem[];
  readonly seen: Set<string>;
  running: boolean;
};

const activeJobs = new Map<string, T3TeamContextBackgroundJob>();

function jobKey(input: { readonly workspaceRoot: string; readonly rootKey: string }): string {
  return `${input.workspaceRoot}|${input.rootKey}`;
}

export function getT3TeamContextBackgroundJob(input: {
  readonly workspaceRoot: string;
  readonly rootKey: string;
  readonly jobId?: string;
}): T3TeamContextBackgroundJob {
  const key = jobKey(input);
  const job =
    activeJobs.get(key) ??
    ({
      jobId: input.jobId ?? t3teamRandomUUID(),
      rootKey: input.rootKey,
      queue: [],
      seen: new Set<string>([input.rootKey]),
      running: false,
    } satisfies T3TeamContextBackgroundJob);
  activeJobs.set(key, job);
  return job;
}

export function sortT3TeamContextBackgroundQueue(job: T3TeamContextBackgroundJob): void {
  job.queue.splice(0, job.queue.length, ...sortT3TeamContextRefreshQueue(job.queue));
}

export function enqueueT3TeamContextBackgroundItems(
  job: T3TeamContextBackgroundJob,
  items: ReadonlyArray<{ readonly key: string; readonly depth: number }>,
): void {
  const now = DateTime.nowUnsafe().epochMilliseconds;
  for (const item of items) {
    const normalized = normalizeT3TeamJiraKey(item.key);
    if (
      !normalized ||
      job.seen.has(normalized) ||
      item.depth > t3teamContextBackgroundOpportunisticMaxDepth
    ) {
      continue;
    }
    job.seen.add(normalized);
    job.queue.push({ resourceKey: normalized, depth: item.depth, enqueuedAt: now });
  }
  sortT3TeamContextBackgroundQueue(job);
}

export function listActiveT3TeamContextBackgroundJobs(): ReadonlyArray<T3TeamContextBackgroundJob> {
  return [...activeJobs.values()];
}

/**
 * Release a finished job from `activeJobs` so its queue + `seen` set (which
 * can grow large for wide dependency graphs) don't outlive the run forever.
 * Only removes the entry when it is genuinely idle (not running, empty
 * queue) and still the same job instance registered under this key — a kick
 * that raced in during teardown and replaced/reused the map entry is left
 * alone. A later kick for the same (workspaceRoot, rootKey) simply creates a
 * fresh job via `getT3TeamContextBackgroundJob`.
 */
export function releaseT3TeamContextBackgroundJobIfIdle(
  input: { readonly workspaceRoot: string; readonly rootKey: string },
  job: T3TeamContextBackgroundJob,
): void {
  if (job.running || job.queue.length > 0) return;
  const key = jobKey(input);
  if (activeJobs.get(key) === job) {
    activeJobs.delete(key);
  }
}
