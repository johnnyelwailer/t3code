// @effect-diagnostics globalDate:off -- recordActivity stamps wall-clock time on every runtime
// event; the watchdog is a pure recorder (no Effect clock plumbing for a hot-path stamp).
/**
 * ThreadSilenceWatchdogService - in-memory per-thread last-activity tracking
 * for the thread silence watchdog (GHE #63).
 *
 * The host tracks last activity per thread (ANY runtime event: message delta,
 * reasoning, tool call start/end, tool result) plus whether the thread has an
 * in-progress tool call, so a coordinator can distinguish silence WITH a
 * pending tool call (legitimate long operation - higher threshold / lower
 * severity) from silence with NO active tool (the real stuck signal).
 *
 * Fed from the existing per-thread runtime event bus by runtime ingestion
 * (the same stream that feeds ThreadBackgroundLiveness) - no second event
 * path. In-memory only: after a server restart the registry is empty until
 * new runtime events arrive; the watch reactor seeds a rehydrated watch's
 * target from the thread shell's persisted `updatedAt` in the meantime.
 *
 * Distinct from the provider-instance `turnInactivityTimeoutSeconds` knob
 * (GHE #113), which aborts a turn whose provider stream goes quiet: this
 * registry only records - it never aborts anything.
 *
 * @module ThreadSilenceWatchdog
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface ThreadSilenceActivityState {
  /** Epoch ms of the most recent runtime event observed for the thread. */
  readonly lastActivityAtMs: number;
  /** In-progress tool items (item.started minus item.completed). */
  readonly pendingToolCount: number;
}

interface ThreadSilenceState {
  lastActivityAtMs: number;
  pendingToolCount: number;
}

export class ThreadSilenceWatchdogService extends Context.Service<
  ThreadSilenceWatchdogService,
  {
    /** Any runtime event is activity; updates the thread's last-activity stamp. */
    readonly recordActivity: (threadId: string) => void;
    /** A tool item began (item.started with a tool-lifecycle item type). */
    readonly recordToolItemStarted: (threadId: string) => void;
    /** A tool item finished (item.completed with a tool-lifecycle item type). */
    readonly recordToolItemCompleted: (threadId: string) => void;
    /** Session death drops the thread's state (a dead thread is never "silent"). */
    readonly clearThread: (threadId: string) => void;
    /**
     * Seed from a persisted timestamp (watch rehydration after a restart).
     * No-op when live state already exists - live events always win over a
     * stale seed.
     */
    readonly seedActivity: (threadId: string, lastActivityAtMs: number) => void;
    readonly getActivityState: (threadId: string) => ThreadSilenceActivityState | undefined;
  }
>()("t3/orchestration/ThreadSilenceWatchdog/ThreadSilenceWatchdogService") {}

export function make(): ThreadSilenceWatchdogService["Service"] {
  const stateByThreadId = new Map<string, ThreadSilenceState>();

  const stateFor = (threadId: string): ThreadSilenceState => {
    let state = stateByThreadId.get(threadId);
    if (state === undefined) {
      state = { lastActivityAtMs: 0, pendingToolCount: 0 };
      stateByThreadId.set(threadId, state);
    }
    return state;
  };

  return {
    recordActivity: (threadId) => {
      stateFor(threadId).lastActivityAtMs = Date.now();
    },
    recordToolItemStarted: (threadId) => {
      stateFor(threadId).pendingToolCount += 1;
    },
    recordToolItemCompleted: (threadId) => {
      const state = stateByThreadId.get(threadId);
      if (state === undefined) return;
      // A completed item with no matching start (event loss) must not go negative.
      state.pendingToolCount = Math.max(0, state.pendingToolCount - 1);
    },
    clearThread: (threadId) => {
      stateByThreadId.delete(threadId);
    },
    seedActivity: (threadId, lastActivityAtMs) => {
      if (stateByThreadId.has(threadId)) return;
      stateByThreadId.set(threadId, { lastActivityAtMs, pendingToolCount: 0 });
    },
    getActivityState: (threadId) => {
      const state = stateByThreadId.get(threadId);
      if (state === undefined) return undefined;
      return { lastActivityAtMs: state.lastActivityAtMs, pendingToolCount: state.pendingToolCount };
    },
  };
}

export const layer = Layer.effect(ThreadSilenceWatchdogService, Effect.sync(make));
