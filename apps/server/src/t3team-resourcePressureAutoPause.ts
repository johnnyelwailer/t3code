/**
 * Effect wrapper around the pure auto-pause state machine
 * (`t3team-resourcePressureAutoPauseModel.ts`, flag `NEXI_FF_RESOURCE_PRESSURE`).
 *
 * The resource-pressure monitor owns one instance: its sample loop feeds
 * `observe` after every sample, and resumed threads are queued on
 * `resumed` for the provider command reactor, which replays their held turn
 * starts. The reactor's turn-start gate calls `admitTurn`, and the turn
 * context assembly calls `takeTurnNote`. State is in memory only: a server
 * restart drops the paused set (the held messages stay in the thread and the
 * user can resend them).
 *
 * @module t3team-resourcePressureAutoPause
 */
import type { ResourcePressureAutoPauseView, ResourcePressureLevel } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import {
  AUTO_PAUSE_COOLDOWN_MS,
  admitTurn,
  autoPauseView,
  INITIAL_AUTO_PAUSE,
  observeLevel,
  takeTurnNote,
  type ResumedThread,
} from "./t3team-resourcePressureAutoPauseModel.ts";

export interface ResourcePressureAutoPauseShape {
  /** Feed one post-hysteresis level at its sample time; queues any resumed threads. */
  readonly observe: (level: ResourcePressureLevel, nowMs: number) => Effect.Effect<void>;
  /** Turn-boundary gate: `hold` = do not start this turn now (queue it). */
  readonly admitTurn: (
    threadId: string,
  ) => Effect.Effect<{ readonly hold: boolean; readonly firstHold: boolean }>;
  /** The one host note (or null) for this thread's next turn context. */
  readonly takeTurnNote: (threadId: string) => Effect.Effect<string | null>;
  /** Batches of threads that just left the pause; buffered, for exactly ONE consumer. */
  readonly resumed: Stream.Stream<ReadonlyArray<ResumedThread>>;
  readonly view: Effect.Effect<ResourcePressureAutoPauseView>;
}

const nowMillis = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

export const makeResourcePressureAutoPause = (
  cooldownMs: number = AUTO_PAUSE_COOLDOWN_MS,
): Effect.Effect<ResourcePressureAutoPauseShape> =>
  Effect.gen(function* () {
    const state = yield* Ref.make(INITIAL_AUTO_PAUSE);
    // A buffered queue, not a PubSub: its one consumer (the reactor) may subscribe after a
    // resume batch was offered, and a lost batch would leave held turns stuck forever.
    const resumedQueue = yield* Queue.unbounded<ReadonlyArray<ResumedThread>>();

    const observe: ResourcePressureAutoPauseShape["observe"] = (level, nowMs) =>
      Ref.modify(state, (current) => {
        const next = observeLevel(current, level, nowMs, cooldownMs);
        return [next.resumed, next.state] as const;
      }).pipe(
        Effect.flatMap((resumed) =>
          resumed.length === 0 ? Effect.void : Queue.offer(resumedQueue, resumed),
        ),
        Effect.asVoid,
      );

    const admit: ResourcePressureAutoPauseShape["admitTurn"] = (threadId) =>
      nowMillis.pipe(
        Effect.flatMap((nowMs) =>
          Ref.modify(state, (current) => {
            const next = admitTurn(current, threadId, nowMs);
            return [{ hold: next.hold, firstHold: next.firstHold }, next.state] as const;
          }),
        ),
      );

    const note: ResourcePressureAutoPauseShape["takeTurnNote"] = (threadId) =>
      Ref.modify(state, (current) => {
        const next = takeTurnNote(current, threadId);
        return [next.note, next.state] as const;
      });

    return {
      observe,
      admitTurn: admit,
      takeTurnNote: note,
      resumed: Stream.fromQueue(resumedQueue),
      view: Ref.get(state).pipe(Effect.map((current) => autoPauseView(current, cooldownMs))),
    };
  });
