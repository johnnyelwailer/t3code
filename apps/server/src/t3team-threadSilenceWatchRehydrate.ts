/**
 * Rehydration replay for the thread silence watchdog (GHE #63): rebuild the
 * pending watch set from persisted events (registered activities minus
 * cancelled ones - the same replay idiom as the child wait, GHE #55).
 *
 * @module t3team-threadSilenceWatchRehydrate
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { sessionStatusToWaitOutcome } from "./t3team-childWait.ts";
import {
  parseThreadSilenceWatchEvent,
  THREAD_SILENCE_WATCH_CANCELLED_KIND,
  THREAD_SILENCE_WATCH_REGISTERED_KIND,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  readEventsMatching,
  type OrchestrationEventReplayFilter,
} from "./t3team-orchestration/t3team-eventReplayFilter.ts";
import type { TerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";
import type { ThreadSilenceWatchEmitter } from "./t3team-threadSilenceWatchEmitTypes.ts";

/**
 * Rebuild the pending watch set from persisted events: registered activities
 * minus cancelled ones (a cancel drops every open watch of that watcher on
 * that target) and minus settlement-closed ones (a `thread.settled` drops
 * the settled thread's open watches as target or watcher).
 */
/** The events `collectPendingThreadSilenceWatches` reads. */
export const PENDING_SILENCE_WATCH_REPLAY_FILTERS: ReadonlyArray<OrchestrationEventReplayFilter> = [
  {
    type: "thread.activity-appended",
    activityKinds: [THREAD_SILENCE_WATCH_REGISTERED_KIND, THREAD_SILENCE_WATCH_CANCELLED_KIND],
  },
  { type: "thread.settled" },
];

export function collectPendingThreadSilenceWatches(
  events: readonly OrchestrationEvent[],
): ThreadSilenceWatchRecord[] {
  const pending = new Map<string, ThreadSilenceWatchRecord>();
  for (const event of events) {
    const action = parseThreadSilenceWatchEvent(event);
    if (action !== null) {
      if (action.type === "registered") {
        // A duplicate watchId in the persisted log is a no-op (first wins),
        // consistent with the live index's add.
        if (pending.has(action.record.watchId)) continue;
        pending.set(action.record.watchId, action.record);
      } else {
        for (const [watchId, record] of pending) {
          if (
            record.watcherThreadId === action.watcherThreadId &&
            record.targetThreadId === action.targetThreadId
          ) {
            pending.delete(watchId);
          }
        }
      }
      continue;
    }
    if (event.type === "thread.settled") {
      const payload = event.payload as { readonly threadId?: unknown };
      if (typeof payload.threadId !== "string") continue;
      // A settled thread is terminal for watch purposes (the live reactor
      // closes on the same event): drop its pending watches as TARGET
      // (notified at settlement) and as WATCHER (dead with it), so a watch
      // registered before it is not re-armed at boot.
      for (const [watchId, record] of pending) {
        if (
          record.targetThreadId === payload.threadId ||
          record.watcherThreadId === payload.threadId
        ) {
          pending.delete(watchId);
        }
      }
    }
  }
  return Array.from(pending.values());
}

/** The events `lastTerminalSequenceByThread` reads. */
export const LAST_TERMINAL_REPLAY_FILTERS: ReadonlyArray<OrchestrationEventReplayFilter> = [
  { type: "thread.session-set" },
  { type: "thread.deleted" },
  { type: "thread.settled" },
];

/**
 * The sequence of each thread's LAST terminal event in a replay: its most
 * recent terminal `thread.session-set`, `thread.deleted`, or `thread.settled`.
 * Used as the trigger sequence when rehydration resolves a target that is
 * ALREADY terminal at boot - the durable marker must anchor on the real stop
 * sequence; anchoring on 0 would make every later restart re-report the
 * same terminal episode.
 */
export function lastTerminalSequenceByThread(
  events: readonly OrchestrationEvent[],
): ReadonlyMap<string, number> {
  const lastByThread = new Map<string, number>();
  const note = (threadId: string, sequence: number): void => {
    lastByThread.set(threadId, Math.max(lastByThread.get(threadId) ?? 0, sequence));
  };
  for (const event of events) {
    if (event.type === "thread.session-set") {
      const payload = event.payload as {
        readonly threadId?: unknown;
        readonly session?: { readonly status?: unknown } | null;
      };
      const threadId = typeof payload.threadId === "string" ? payload.threadId : undefined;
      const status = payload.session?.status;
      if (threadId === undefined || typeof status !== "string") continue;
      if (sessionStatusToWaitOutcome(status) === null) continue;
      note(threadId, event.sequence);
    } else if (event.type === "thread.deleted") {
      const payload = event.payload as { readonly threadId?: unknown };
      if (typeof payload.threadId === "string") note(payload.threadId, event.sequence);
    } else if (event.type === "thread.settled") {
      // Settlement is terminal for watch purposes too: a watch registered
      // after it must anchor its terminal marker on the real stop sequence,
      // not 0, or every later restart re-reports the same episode.
      const payload = event.payload as { readonly threadId?: unknown };
      if (typeof payload.threadId === "string") note(payload.threadId, event.sequence);
    }
  }
  return lastByThread;
}

/**
 * Boot rehydrate for the silence-watch reactor: fold the terminal-notify ledger
 * and the pending watch set from the events they read, then re-arm every
 * still-pending watch anchored on its target's last terminal sequence.
 */
export const rehydrateThreadSilenceWatches = (input: {
  readonly engine: Pick<OrchestrationEngineShape, "readEvents" | "readEventsMatching">;
  readonly dedup: Pick<TerminalNotifyLedger, "rehydrate" | "replayFilters">;
  readonly emitter: Pick<ThreadSilenceWatchEmitter, "onRegistered">;
}) =>
  Effect.gen(function* () {
    const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
      readEventsMatching(input.engine, [
        ...input.dedup.replayFilters,
        ...LAST_TERMINAL_REPLAY_FILTERS,
        ...PENDING_SILENCE_WATCH_REPLAY_FILTERS,
      ]),
    ).pipe(Effect.map((chunk) => Array.from(chunk)));
    input.dedup.rehydrate(replayed);
    const lastTerminalByThread = lastTerminalSequenceByThread(replayed);
    for (const record of collectPendingThreadSilenceWatches(replayed)) {
      yield* input.emitter.onRegistered(
        record,
        lastTerminalByThread.get(record.targetThreadId) ?? 0,
      );
    }
  });
