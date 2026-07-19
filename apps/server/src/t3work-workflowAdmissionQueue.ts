import { getWorkflowEphemeralConcurrencyPolicy } from "./t3work-workflowEphemeralConcurrencyPolicy.ts";

type Waiter = {
  readonly runId: string;
  readonly resolve: (acquired: boolean) => void;
  readonly promise: Promise<boolean>;
};

const active = new Set<string>();
const waiting: Waiter[] = [];
const cancelled = new Set<string>();
const paused = new Set<string>();

const capacity = (): number => {
  const configured = getWorkflowEphemeralConcurrencyPolicy().maxActiveSteps;
  return configured === "unlimited" ? Number.POSITIVE_INFINITY : configured;
};

const drain = (): void => {
  while (active.size < capacity() && waiting.length > 0) {
    const next = waiting.shift();
    if (next === undefined) return;
    active.add(next.runId);
    next.resolve(true);
  }
};

/** FIFO process-local permit queue. Durable `queued` rows rebuild these waiters at startup. */
export const workflowAdmissionQueue = {
  acquire: (runId: string): Promise<boolean> => {
    if (cancelled.has(runId) || paused.has(runId)) return Promise.resolve(false);
    if (active.has(runId)) return Promise.resolve(true);
    const existing = waiting.find((entry) => entry.runId === runId);
    if (existing !== undefined) return existing.promise;
    if (active.size < capacity()) {
      active.add(runId);
      return Promise.resolve(true);
    }
    let resolveWaiter!: (acquired: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolveWaiter = resolve;
    });
    waiting.push({ runId, resolve: resolveWaiter, promise });
    return promise;
  },
  release: (runId: string): void => {
    active.delete(runId);
    drain();
  },
  cancel: (runId: string): void => {
    cancelled.add(runId);
    active.delete(runId);
    for (let index = waiting.length - 1; index >= 0; index -= 1) {
      if (waiting[index]?.runId === runId) waiting.splice(index, 1)[0]?.resolve(false);
    }
    drain();
  },
  pause: (runId: string): void => {
    paused.add(runId);
    active.delete(runId);
    for (let index = waiting.length - 1; index >= 0; index -= 1) {
      if (waiting[index]?.runId === runId) waiting.splice(index, 1)[0]?.resolve(false);
    }
    drain();
  },
  resume: (runId: string): void => {
    paused.delete(runId);
    drain();
  },
  reconfigure: (): void => drain(),
  isCancelled: (runId: string): boolean => cancelled.has(runId),
  isPaused: (runId: string): boolean => paused.has(runId),
  snapshot: () => ({
    active: [...active],
    queued: waiting.map((entry) => entry.runId),
  }),
  resetForTests: (): void => {
    for (const entry of waiting.splice(0)) entry.resolve(false);
    active.clear();
    cancelled.clear();
    paused.clear();
  },
};
