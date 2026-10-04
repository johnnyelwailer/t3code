/**
 * Per-run turn-inactivity watchdog and interrupt backstop, driven by `RunExecutionServiceV2`.
 *
 * - Inactivity (GHE #113/#297/#306): every routed provider event re-arms the budget
 *   (`budgetAfterEvent`). A turn that is legitimately waiting is never treated as stalled: while a
 *   runtime request awaits a person's answer the budget keeps re-arming, and an open tool call
 *   stretches it (`t3team-turnInactivityWaits.ts`). When the budget expires the watchdog
 *   interrupts the root provider turn. Whatever ends the turn then — the provider acknowledging
 *   the interrupt, or nothing within `INTERRUPT_SETTLE_GRACE_MS` — the run fails retryably
 *   (`transport_error` / `turn_inactivity`), so a stall never reads as a user Stop.
 * - Stop backstop (GHE #256): once the user's Stop is pending (an unpaired run interrupt request),
 *   a root terminal must follow within the same grace, or the run is settled `interrupted` — the
 *   outcome the user asked for, so it stays resumable and is never auto-continued.
 *
 * The watchdog is scoped to one run attempt: a newer run has its own, so a stale turn can never
 * kill its replacement. It exits as soon as the run reports settled, and `stop` ends it early.
 *
 * @module t3team-turnInactivityWatchdog
 */
import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";
import { budgetAfterEvent, INTERRUPT_SETTLE_GRACE_MS } from "./t3team-turnInactivityPolicy.ts";
import {
  outcomeFor,
  type SettleCode,
  stallFailure,
  type TurnInactivityOutcome,
} from "./t3team-turnInactivitySettlement.ts";
import {
  makeTurnInactivityWaits,
  type TurnRuntimeRequestRef,
} from "./t3team-turnInactivityWaits.ts";

/** How often a quiet run re-checks for a pending Stop (and a waiting one for its answer). */
const STOP_POLL_MS = 10_000;

type TerminalEvent = Extract<ProviderAdapterV2Event, { readonly type: "turn.terminal" }>;

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

type Phase =
  | {
      readonly type: "watching";
      readonly lastActivityAt: number;
      readonly budgetMs: number;
      /** A runtime request was awaiting its answer at the last check. */
      readonly waiting: boolean;
    }
  | { readonly type: "settling"; readonly deadline: number; readonly code: SettleCode };

export const makeTurnInactivityWatchdog = (baseBudgetMs: number) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    const phase = yield* Ref.make<Phase>({
      type: "watching",
      lastActivityAt: startedAt,
      budgetMs: baseBudgetMs,
      waiting: false,
    });
    const waits = yield* makeTurnInactivityWaits;
    const pendingStop = yield* Ref.make<Effect.Effect<boolean>>(Effect.succeed(false));
    const fiber = yield* Ref.make<Fiber.Fiber<void> | null>(null);

    const touch = (event: ProviderAdapterV2Event) =>
      Effect.gen(function* () {
        yield* waits.observe(event);
        const now = yield* Clock.currentTimeMillis;
        yield* Ref.update(phase, (current): Phase =>
          current.type === "watching"
            ? {
                type: "watching",
                lastActivityAt: now,
                budgetMs: budgetAfterEvent(baseBudgetMs, event),
                waiting: false,
              }
            : current,
        );
      });

    /**
     * The provider's answer to the watchdog's OWN interrupt is a stall, not a stop: a root
     * `interrupted`/`cancelled` terminal that lands while that interrupt is pending (and no user
     * Stop is) becomes the failed terminal `failedTerminal` builds.
     */
    const reviseTerminal = <E>(
      event: ProviderAdapterV2Event,
      failedTerminal: (failure: OrchestrationV2ProviderFailure) => Effect.Effect<TerminalEvent, E>,
    ): Effect.Effect<ProviderAdapterV2Event, E> =>
      Effect.gen(function* () {
        if (event.type !== "turn.terminal") return event;
        if (event.status !== "interrupted" && event.status !== "cancelled") return event;
        const current = yield* Ref.get(phase);
        if (current.type !== "settling" || current.code !== "turn_inactivity") return event;
        if (yield* Effect.flatten(Ref.get(pendingStop))) return event;
        const failed = yield* failedTerminal(stallFailure(baseBudgetMs));
        return {
          ...failed,
          providerTurnId: event.providerTurnId,
          threadDisposition: event.threadDisposition,
        };
      });

    const loop = <EI, ES>(controls: TurnInactivityWatchdogControls<EI, ES>): Effect.Effect<void> =>
      Effect.gen(function* () {
        while (!(yield* controls.isSettled)) {
          const now = yield* Clock.currentTimeMillis;
          const current = yield* Ref.get(phase);
          if (current.type === "settling") {
            // A Stop pressed while the watchdog's own interrupt is unanswered is the user's Stop.
            if (current.code === "turn_inactivity" && (yield* controls.hasPendingStop)) {
              yield* Ref.set(phase, { ...current, code: "interrupt_no_terminal" });
              continue;
            }
            if (now >= current.deadline) {
              yield* Effect.logWarning("t3team.turn-watchdog.settling-run", { code: current.code });
              yield* controls.settle(outcomeFor(current.code, baseBudgetMs));
              return;
            }
            yield* Effect.sleep(Math.min(current.deadline - now, STOP_POLL_MS));
            continue;
          }
          if (yield* controls.hasPendingStop) {
            yield* Ref.set(phase, {
              type: "settling",
              deadline: now + INTERRUPT_SETTLE_GRACE_MS,
              code: "interrupt_no_terminal",
            });
            continue;
          }
          const deadline = current.lastActivityAt + (yield* waits.budgetMs(current.budgetMs));
          if (current.waiting || now >= deadline) {
            // Waiting for a person is healthy however long it takes; once the answer lands the
            // budget runs from the last time the wait was seen.
            const waiting = yield* waits.awaitingAnswer(controls.isRuntimeRequestPending);
            if (waiting || current.waiting) {
              yield* Ref.update(phase, (latest): Phase =>
                latest.type === "watching"
                  ? { ...latest, lastActivityAt: waiting ? now : latest.lastActivityAt, waiting }
                  : latest,
              );
              if (waiting) yield* Effect.sleep(STOP_POLL_MS);
              continue;
            }
          }
          if (now < deadline) {
            yield* Effect.sleep(Math.min(deadline - now, STOP_POLL_MS));
            continue;
          }
          yield* Effect.logWarning("t3team.turn-watchdog.inactive", { budgetMs: current.budgetMs });
          // Settling BEFORE the interrupt, so an acknowledgement racing it is read as the stall.
          yield* Ref.set(phase, {
            type: "settling",
            deadline: now + INTERRUPT_SETTLE_GRACE_MS,
            code: "turn_inactivity",
          });
          const interrupted = yield* controls.interruptTurn.pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("t3team.turn-watchdog.interrupt-failed", { cause }).pipe(
                Effect.as(false),
              ),
            ),
          );
          if (!interrupted) {
            yield* controls.settle(outcomeFor("turn_inactivity", current.budgetMs));
            return;
          }
        }
      }).pipe(
        Effect.catchCause((cause) => Effect.logError("t3team.turn-watchdog.failed", { cause })),
      );

    const start = <EI, ES>(controls: TurnInactivityWatchdogControls<EI, ES>) =>
      Ref.set(pendingStop, controls.hasPendingStop).pipe(
        Effect.andThen(Effect.forkDetach(loop(controls))),
        Effect.flatMap((started) => Ref.set(fiber, started)),
      );

    // Never awaits the watchdog: `settle` may be ending the very stream whose finalizer stops it.
    const stop = Ref.getAndSet(fiber, null).pipe(
      Effect.flatMap((running) =>
        running === null ? Effect.void : Effect.asVoid(Effect.forkDetach(Fiber.interrupt(running))),
      ),
    );

    return { touch, reviseTerminal, start, stop };
  });

export type TurnInactivityWatchdog = Effect.Success<ReturnType<typeof makeTurnInactivityWatchdog>>;

export type { TurnInactivityOutcome } from "./t3team-turnInactivitySettlement.ts";
