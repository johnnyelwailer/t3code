export type ProjectWorkspaceSyncStatus = "idle" | "pending" | "in-flight" | "synced" | "failed";

type ProjectWorkspaceSyncRun = () => Promise<void>;
type Timer = ReturnType<typeof setTimeout>;

type SyncWaiter = {
  readonly signature: string;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};

type WorkspaceSyncState = {
  readonly workspaceRoot: string;
  status: ProjectWorkspaceSyncStatus;
  activeLeases: number;
  revision: number;
  retryAttempt: number;
  latestSignature?: string;
  syncedSignature?: string;
  latestRun?: ProjectWorkspaceSyncRun;
  inFlight?: Promise<void>;
  flushTimer?: Timer;
  retryTimer?: Timer;
  lastError?: unknown;
  waiters: SyncWaiter[];
};

const DEFAULT_DEBOUNCE_MS = 150;
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000] as const;

const syncStateByWorkspaceRoot = new Map<string, WorkspaceSyncState>();

function getWorkspaceSyncState(workspaceRoot: string): WorkspaceSyncState {
  const existing = syncStateByWorkspaceRoot.get(workspaceRoot);
  if (existing) return existing;
  const state: WorkspaceSyncState = {
    workspaceRoot,
    status: "idle",
    activeLeases: 0,
    revision: 0,
    retryAttempt: 0,
    waiters: [],
  };
  syncStateByWorkspaceRoot.set(workspaceRoot, state);
  return state;
}

function clearTimer(timer: Timer | undefined): void {
  if (timer) clearTimeout(timer);
}

function settleWaiters(
  state: WorkspaceSyncState,
  predicate: (waiter: SyncWaiter) => boolean,
  settle: (waiter: SyncWaiter) => void,
): void {
  const remaining: SyncWaiter[] = [];
  for (const waiter of state.waiters) {
    if (predicate(waiter)) settle(waiter);
    else remaining.push(waiter);
  }
  state.waiters = remaining;
}

function scheduleFlush(state: WorkspaceSyncState, delayMs: number): void {
  clearTimer(state.flushTimer);
  state.flushTimer = setTimeout(() => {
    delete state.flushTimer;
    void flushWorkspaceSync(state);
  }, delayMs);
}

function scheduleRetry(state: WorkspaceSyncState): void {
  if (state.activeLeases <= 0 || state.retryTimer) return;
  const delayMs = RETRY_DELAYS_MS[Math.min(state.retryAttempt, RETRY_DELAYS_MS.length - 1)];
  state.retryAttempt += 1;
  state.retryTimer = setTimeout(() => {
    delete state.retryTimer;
    if (state.activeLeases > 0) scheduleFlush(state, 0);
  }, delayMs);
}

async function flushWorkspaceSync(state: WorkspaceSyncState): Promise<void> {
  if (state.inFlight || !state.latestRun || !state.latestSignature) return;
  const run = state.latestRun;
  const signature = state.latestSignature;
  const revision = state.revision;
  const promise = run();
  state.inFlight = promise;
  state.status = "in-flight";
  clearTimer(state.retryTimer);
  delete state.retryTimer;

  try {
    await promise;
    if (state.inFlight !== promise) return;
    delete state.inFlight;
    state.retryAttempt = 0;
    state.syncedSignature = signature;
    settleWaiters(
      state,
      (waiter) => waiter.signature === signature,
      (waiter) => waiter.resolve(),
    );
    if (state.latestSignature === signature && state.revision === revision) {
      state.status = "synced";
      delete state.lastError;
      return;
    }
    state.status = "pending";
    scheduleFlush(state, 0);
  } catch (error) {
    if (state.inFlight !== promise) return;
    delete state.inFlight;
    if (state.latestSignature === signature && state.revision === revision) {
      state.status = "failed";
      state.lastError = error;
      settleWaiters(
        state,
        (waiter) => waiter.signature === signature,
        (waiter) => waiter.reject(error),
      );
      scheduleRetry(state);
      return;
    }
    state.status = "pending";
    scheduleFlush(state, 0);
  }
}

export function retainProjectWorkspaceSync(workspaceRoot: string): () => void {
  const state = getWorkspaceSyncState(workspaceRoot);
  state.activeLeases += 1;
  return () => {
    state.activeLeases = Math.max(0, state.activeLeases - 1);
    if (state.activeLeases === 0) {
      clearTimer(state.retryTimer);
      delete state.retryTimer;
    }
  };
}

export function enqueueProjectWorkspaceSync(input: {
  readonly workspaceRoot: string;
  readonly signature: string;
  readonly run: ProjectWorkspaceSyncRun;
  readonly debounceMs?: number;
}): Promise<void> {
  const state = getWorkspaceSyncState(input.workspaceRoot);
  if (
    state.status === "synced" &&
    state.syncedSignature === input.signature &&
    !state.inFlight &&
    !state.flushTimer
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    state.waiters.push({ signature: input.signature, resolve, reject });
    const isNewPayload = state.latestSignature !== input.signature;
    state.latestSignature = input.signature;
    state.latestRun = input.run;
    if (isNewPayload) {
      state.revision += 1;
      state.retryAttempt = 0;
      settleWaiters(
        state,
        (waiter) => waiter.signature !== input.signature,
        (waiter) => waiter.resolve(),
      );
    }
    if (!state.inFlight) {
      state.status = "pending";
      clearTimer(state.retryTimer);
      delete state.retryTimer;
      scheduleFlush(state, input.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    }
  });
}

export function getProjectWorkspaceSyncStatus(workspaceRoot: string): {
  readonly status: ProjectWorkspaceSyncStatus;
  readonly lastError?: unknown;
} {
  const state = syncStateByWorkspaceRoot.get(workspaceRoot);
  if (!state) return { status: "idle" };
  return {
    status: state.status,
    ...(state.lastError !== undefined ? { lastError: state.lastError } : {}),
  };
}

export function resetProjectWorkspaceSyncQueueForTests(): void {
  for (const state of syncStateByWorkspaceRoot.values()) {
    clearTimer(state.flushTimer);
    clearTimer(state.retryTimer);
  }
  syncStateByWorkspaceRoot.clear();
}
