import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

/**
 * Stagger gate for thread-subscription resubscribe bursts (GHE #382 storm).
 *
 * When a session is replaced (probe timeout, reconnect), every live thread
 * stream reopens in the same tick — hundreds of `subscribeThread` snapshots
 * hitting the server at once, which on a heavy install is exactly the burst
 * that starved the liveness probe and kept the disconnect loop self-
 * sustaining. The gate spreads a burst over time: the first
 * `maxImmediate` streams go straight out, each later stream waits an extra
 * `stepMs` per slot, so the burst lands as a bounded drip instead of a spike.
 *
 * A burst is keyed by the session object (a new session object on every
 * session change) and decays after `decayMs` of quiet, so a later, smaller
 * resubscribe (e.g. a foreground wake) starts at slot 0 again instead of
 * inheriting the previous burst's counter.
 *
 * Time is explicit: the pure method takes `nowMs` so tests are deterministic,
 * and the production path uses `allocateDelayMsEffect`, which reads the
 * runtime clock via `Clock.clockWith` — the runtime-set clock reference, so no `Clock` requirement is added to the effect (the subscribe streams' `R` stays unchanged for every consumer).
 */

export interface ThreadResubscribeGateOptions {
  /** Streams in a burst that may open immediately (default 8). */
  readonly maxImmediate?: number;
  /** Milliseconds of extra delay per slot queued behind the immediate ones (default 5). */
  readonly stepMs?: number;
  /** Milliseconds of quiet after which the next allocation restarts at slot 0 (default 2000). */
  readonly decayMs?: number;
}

export interface ThreadResubscribeGate {
  /**
   * Allocate the delay in milliseconds for the next stream opening in the
   * burst identified by `burstKey` (pass the session object), at instant
   * `nowMs`.
   */
  allocateDelayMs: (burstKey: unknown, nowMs: number) => number;
  /** Production path: reads the runtime clock, no `Clock` requirement. */
  allocateDelayMsEffect: (burstKey: unknown) => Effect.Effect<number, never, never>;
}

const DEFAULT_MAX_IMMEDIATE = 8;
const DEFAULT_STEP_MS = 5;
const DEFAULT_DECAY_MS = 2_000;

export const createThreadResubscribeGate = (
  options: ThreadResubscribeGateOptions = {},
): ThreadResubscribeGate => {
  const maxImmediate = options.maxImmediate ?? DEFAULT_MAX_IMMEDIATE;
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
  const decayMs = options.decayMs ?? DEFAULT_DECAY_MS;
  const slotsByBurst = new Map<unknown, { slot: number; lastAtMs: number }>();
  const allocate = (burstKey: unknown, now: number): number => {
    const current = slotsByBurst.get(burstKey);
    const slot = current !== undefined && now - current.lastAtMs <= decayMs ? current.slot : 0;
    slotsByBurst.set(burstKey, { slot: slot + 1, lastAtMs: now });
    return slot < maxImmediate ? 0 : (slot - maxImmediate + 1) * stepMs;
  };
  return {
    allocateDelayMs: allocate,
    allocateDelayMsEffect: Effect.fn("ThreadResubscribeGate.allocateDelayMsEffect")(
      function* (burstKey: unknown) {
        const now = yield* Clock.clockWith((clock) => clock.currentTimeMillis);
        return allocate(burstKey, now);
      },
    ),
  };
};

/** The shared gate the thread-state wiring uses. One burst table per process. */
export const defaultThreadResubscribeGate: ThreadResubscribeGate =
  createThreadResubscribeGate();
