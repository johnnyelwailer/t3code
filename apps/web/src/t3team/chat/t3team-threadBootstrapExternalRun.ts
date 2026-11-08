import { useSyncExternalStore } from "react";

import type { ThreadBootstrapProgress } from "~/t3team/chat/t3team-threadBootstrapProgress";

/**
 * Progress and outcome of a bootstrap that started before the thread's chat mounted (a kickoff
 * that sends at click time). The mounted chat plans `none` for such a thread, so it has no attempt
 * of its own to report from and reads this instead.
 */
export type ExternalThreadBootstrapRun = {
  readonly progress: ThreadBootstrapProgress | null;
  readonly status: "running" | "idle" | "failed";
};

/** Keeps the map from growing without bound in a long-lived tab. */
const MAX_TRACKED_RUNS = 256;

const runsByThreadId = new Map<string, ExternalThreadBootstrapRun>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishExternalThreadBootstrapRun(
  threadId: string,
  patch: Partial<ExternalThreadBootstrapRun>,
): void {
  const current = runsByThreadId.get(threadId) ?? { progress: null, status: "running" as const };
  runsByThreadId.delete(threadId);
  while (runsByThreadId.size >= MAX_TRACKED_RUNS) {
    const oldest = runsByThreadId.keys().next();
    if (oldest.done) break;
    runsByThreadId.delete(oldest.value);
  }
  runsByThreadId.set(threadId, { ...current, ...patch });
  notify();
}

/** Drops the run so a user retry reports through the mounted chat's own attempt again. */
export function clearExternalThreadBootstrapRun(threadId: string): void {
  if (runsByThreadId.delete(threadId)) notify();
}

export function readExternalThreadBootstrapRun(
  threadId: string,
): ExternalThreadBootstrapRun | undefined {
  return runsByThreadId.get(threadId);
}

export function useExternalThreadBootstrapRun(
  threadId: string,
): ExternalThreadBootstrapRun | undefined {
  return useSyncExternalStore(subscribe, () => readExternalThreadBootstrapRun(threadId));
}

/** Test-only: clears every run so cases cannot leak state into each other. */
export function clearExternalThreadBootstrapRuns(): void {
  runsByThreadId.clear();
  notify();
}
