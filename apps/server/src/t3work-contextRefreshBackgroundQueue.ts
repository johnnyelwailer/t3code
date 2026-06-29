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
