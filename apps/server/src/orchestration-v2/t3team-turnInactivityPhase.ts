/**
 * The turn-inactivity watchdog's state and its pure transitions, plus the controls a run hands it.
 * Kept apart from the loop in `t3team-turnInactivityWatchdog.ts` so each stays small.
 *
 * @module t3team-turnInactivityPhase
 */
import type * as Effect from "effect/Effect";

import { MAX_TURN_INACTIVITY_SELFHEAL_ATTEMPTS } from "./t3team-turnInactivityPolicy.ts";
import type { SettleCode, TurnInactivityOutcome } from "./t3team-turnInactivitySettlement.ts";
import type { TurnRuntimeRequestRef } from "./t3team-turnInactivityWaits.ts";

export interface TurnInactivityWatchdogControls<EI, ES> {
  /** True once the root terminal was seen or the run was finalized. */
  readonly isSettled: Effect.Effect<boolean>;
  readonly hasPendingStop: Effect.Effect<boolean>;
  /** Whether a runtime request the run raised still waits for its answer. */
  readonly isRuntimeRequestPending: (request: TurnRuntimeRequestRef) => Effect.Effect<boolean>;
  /**
   * Interrupts the root provider turn; `false` (no provider turn yet) or a failure settles the
   * run at once.
   */
  readonly interruptTurn: Effect.Effect<boolean, EI>;
  /** Settles the run with this outcome (idempotent on the caller's side). */
  readonly settle: (outcome: TurnInactivityOutcome) => Effect.Effect<void, ES>;
}

export type TurnInactivityPhase =
  | {
      readonly type: "watching";
      readonly lastActivityAt: number;
      readonly budgetMs: number;
      /** A runtime request was awaiting its answer at the last check. */
      readonly waiting: boolean;
      /** Self-heal re-arms used on this turn; reset to 0 on any stream activity. */
      readonly selfHealAttempts: number;
    }
  | { readonly type: "settling"; readonly deadline: number; readonly code: SettleCode };

type Watching = Extract<TurnInactivityPhase, { readonly type: "watching" }>;

/** A fresh watching window: stream activity at `now` with this budget. */
export const watchingPhase = (now: number, budgetMs: number): TurnInactivityPhase => ({
  type: "watching",
  lastActivityAt: now,
  budgetMs,
  waiting: false,
  selfHealAttempts: 0,
});

/** Records whether a runtime request still waits; a wait keeps the window anchored at `now`. */
export const observeWaiting =
  (now: number, waiting: boolean) =>
  (latest: TurnInactivityPhase): TurnInactivityPhase =>
    latest.type === "watching"
      ? { ...latest, lastActivityAt: waiting ? now : latest.lastActivityAt, waiting }
      : latest;

/**
 * Self-heal (GHE #113) applies only to a genuinely-silent turn — an open tool call or pending
 * approval stretched the budget and keeps its own backstop — and only a bounded number of times.
 */
export const canSelfHeal = (current: Watching, stretchedMs: number): boolean =>
  stretchedMs === current.budgetMs &&
  current.selfHealAttempts < MAX_TURN_INACTIVITY_SELFHEAL_ATTEMPTS;

/** Re-arms a fresh plain window and counts the self-heal attempt. */
export const selfHealed =
  (now: number, baseBudgetMs: number) =>
  (latest: TurnInactivityPhase): TurnInactivityPhase =>
    latest.type === "watching"
      ? {
          ...latest,
          lastActivityAt: now,
          budgetMs: baseBudgetMs,
          selfHealAttempts: latest.selfHealAttempts + 1,
        }
      : latest;
