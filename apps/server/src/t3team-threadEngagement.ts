/**
 * Per-thread user-engagement signal for the inter-agent drain back-off
 * (inter-agent messaging overhaul).
 *
 * "Engaged" = the user is ACTIVELY TYPING in that thread's composer. The web
 * composer reports a debounced composing heartbeat over the existing
 * WebSocket (`orchestration.noteComposing` → ws.ts → {@link noteTyping})
 * while the user types; the signal is keyed PER THREAD and LAPSES on its own
 * after the typing window (t3team-actorMessageReactorLimits.
 * `T3TEAM_THREAD_TYPING_LAPSE_MS`) passes without a heartbeat.
 *
 * Why typing only:
 * - A viewing/presence signal (a thread left open all day) would starve the
 *   queue forever, so the drain has no hard starvation cap — safety comes
 *   from the signal being SELF-CLEARING, which only a genuine typing signal
 *   is. Presence may exist elsewhere as a hint, but it must never be the
 *   thing that holds a digest.
 * - Per-thread scoping: typing in thread A must NOT hold back the digest in
 *   thread B. Each thread's mailbox is gated only by composing activity in
 *   THAT thread's composer.
 *
 * State is in-memory and process-local, matching the actor mailbox it serves.
 * The drain loop consults {@link isEngaged} between baseline windows.
 *
 * @module t3team-threadEngagement
 */
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import {
  resolveActorMessageDebounceMs,
  resolveThreadTypingLapseMs,
} from "./t3team-actorMessageReactorLimits.ts";

export interface T3TeamThreadEngagementShape {
  /**
   * The user's composer in this thread sent a composing heartbeat (they are
   * actively typing RIGHT NOW in THIS thread's composer).
   */
  readonly noteTyping: (threadId: string) => Effect.Effect<void>;
  /**
   * Whether the user is actively typing in this thread's composer right now
   * (a heartbeat inside the typing-lapse window). Nothing else counts —
   * viewing, sent-message recency, or other threads' activity.
   */
  readonly isEngaged: (threadId: string) => Effect.Effect<boolean>;
}

export const T3TeamThreadEngagement = Context.Service<
  "T3TeamThreadEngagement",
  T3TeamThreadEngagementShape
>("T3TeamThreadEngagement");

export const T3TeamThreadEngagementLive = Layer.effect(
  T3TeamThreadEngagement,
  Effect.gen(function* () {
    /**
     * Per-thread last-typing timestamp in virtual-clock ms. Absent = never
     * typed in this process (Map.get's `undefined` is the no-sentinel case,
     * so virtual time 0 is representable without a sentinel value).
     * Mutated IN PLACE — a heartbeat must not copy the whole map — and
     * EVICTED: `isEngaged` drops a key the moment it lapses, and each
     * heartbeat sweeps the map at most once per baseline window so the
     * structure can only ever grow between touches of the same thread.
     */
    const state = yield* Ref.make({
      lastTypingAtMs: new Map<string, number>(),
      lastSweepMs: 0,
    });

    const noteTyping: T3TeamThreadEngagementShape["noteTyping"] = (threadId) =>
      DateTime.now.pipe(
        Effect.map((now) => DateTime.toEpochMillis(now)),
        Effect.andThen((atMs) =>
          Ref.update(state, (current) => {
            current.lastTypingAtMs.set(threadId, atMs);
            // Amortized sweep: a full expired-entry pass at most once per
            // baseline window (the same 60s cadence the drain loop re-checks
            // on), never per heartbeat.
            if (atMs - current.lastSweepMs >= resolveActorMessageDebounceMs()) {
              for (const [id, at] of current.lastTypingAtMs) {
                if (atMs - at > resolveThreadTypingLapseMs()) {
                  current.lastTypingAtMs.delete(id);
                }
              }
              current.lastSweepMs = atMs;
            }
            return current;
          }),
        ),
      );

    const isEngaged: T3TeamThreadEngagementShape["isEngaged"] = (threadId) =>
      Effect.gen(function* () {
        const nowMs = yield* DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));
        const atMs = yield* Ref.get(state).pipe(
          Effect.map((current) => current.lastTypingAtMs.get(threadId)),
        );
        if (atMs === undefined) {
          return false;
        }
        // Self-clearing: the heartbeat must be recent, and the signal is
        // ALWAYS scoped to this thread — no other thread's typing extends it.
        const engaged = nowMs - atMs <= resolveThreadTypingLapseMs();
        if (!engaged) {
          // Evict on lapse: a checked thread never lingers in the map.
          yield* Ref.update(state, (current) => {
            current.lastTypingAtMs.delete(threadId);
            return current;
          });
        }
        return engaged;
      });

    return { noteTyping, isEngaged };
  }),
);
