/**
 * Per-run turn-inactivity watchdog and interrupt backstop, driven by `RunExecutionServiceV2`.
 *
 * - Inactivity (GHE #113/#297/#306): every routed provider event re-arms the budget
 *   (`budgetAfterEvent`). When it expires the watchdog interrupts the root provider turn; if the
 *   interrupt fails, or no root terminal follows within `INTERRUPT_SETTLE_GRACE_MS`, the run is
 *   settled as failed (`transport_error` / `turn_inactivity`).
 * - Stop backstop (GHE #256): once the user's Stop is pending (an unpaired run interrupt
 *   request), a root terminal must follow within the same grace or the run is settled as failed
 *   (`transport_error` / `interrupt_no_terminal`).
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
import { makeProviderFailure } from "./ProviderFailure.ts";
import { budgetAfterEvent, INTERRUPT_SETTLE_GRACE_MS } from "./t3team-turnInactivityPolicy.ts";

/** How often a quiet run re-checks for a pending Stop. */
const STOP_POLL_MS = 10_000;

export interface TurnInactivityWatchdogControls<EI, ES> {
  /** True once the root terminal was seen or the run was finalized. */
  readonly isSettled: Effect.Effect<boolean>;
  readonly hasPendingStop: Effect.Effect<boolean>;
  /**
   * Interrupts the root provider turn; `false` (no provider turn yet) or a failure settles the
   * run at once.
   */
  readonly interruptTurn: Effect.Effect<boolean, EI>;
  /** Settles the run as failed with this failure (idempotent on the caller's side). */
  readonly settle: (failure: OrchestrationV2ProviderFailure) => Effect.Effect<void, ES>;
}

export interface TurnInactivityWatchdog {
  readonly touch: (event: ProviderAdapterV2Event) => Effect.Effect<void>;
  readonly start: <EI, ES>(controls: TurnInactivityWatchdogControls<EI, ES>) => Effect.Effect<void>;
  readonly stop: Effect.Effect<void>;
}

type Phase =
  | { readonly type: "watching"; readonly lastActivityAt: number; readonly budgetMs: number }
  | {
      readonly type: "settling";
      readonly deadline: number;
      readonly code: "turn_inactivity" | "interrupt_no_terminal";
    };

const failureFor = (code: "turn_inactivity" | "interrupt_no_terminal", budgetMs: number) =>
  makeProviderFailure({
    class: "transport_error",
    code,
    retryable: true,
    message:
      code === "turn_inactivity"
        ? `Turn stalled: no provider stream activity for ${Math.round(budgetMs / 1000)} seconds.`
        : "The provider did not finish the turn after it was stopped.",
  });

export const makeTurnInactivityWatchdog = (baseBudgetMs: number) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    const phase = yield* Ref.make<Phase>({
      type: "watching",
      lastActivityAt: startedAt,
      budgetMs: baseBudgetMs,
    });
    const fiber = yield* Ref.make<Fiber.Fiber<void> | null>(null);

    const touch = (event: ProviderAdapterV2Event) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* Ref.update(phase, (current): Phase =>
          current.type === "watching"
            ? {
                type: "watching",
                lastActivityAt: now,
                budgetMs: budgetAfterEvent(baseBudgetMs, event),
              }
            : current,
        );
      });

    const loop = <EI, ES>(controls: TurnInactivityWatchdogControls<EI, ES>): Effect.Effect<void> =>
      Effect.gen(function* () {
        while (!(yield* controls.isSettled)) {
          const now = yield* Clock.currentTimeMillis;
          const current = yield* Ref.get(phase);
          if (current.type === "settling") {
            if (now >= current.deadline) {
              yield* Effect.logWarning("t3team.turn-watchdog.settling-run", { code: current.code });
              yield* controls.settle(failureFor(current.code, baseBudgetMs));
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
          const deadline = current.lastActivityAt + current.budgetMs;
          if (now < deadline) {
            yield* Effect.sleep(Math.min(deadline - now, STOP_POLL_MS));
            continue;
          }
          yield* Effect.logWarning("t3team.turn-watchdog.inactive", { budgetMs: current.budgetMs });
          const interrupted = yield* controls.interruptTurn.pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("t3team.turn-watchdog.interrupt-failed", { cause }).pipe(
                Effect.as(false),
              ),
            ),
          );
          if (!interrupted) {
            yield* controls.settle(failureFor("turn_inactivity", current.budgetMs));
            return;
          }
          yield* Ref.set(phase, {
            type: "settling",
            deadline: now + INTERRUPT_SETTLE_GRACE_MS,
            code: "turn_inactivity",
          });
        }
      }).pipe(
        Effect.catchCause((cause) => Effect.logError("t3team.turn-watchdog.failed", { cause })),
      );

    const start = <EI, ES>(controls: TurnInactivityWatchdogControls<EI, ES>) =>
      loop(controls).pipe(
        Effect.forkDetach,
        Effect.flatMap((started) => Ref.set(fiber, started)),
      );

    // Never awaits the watchdog: `settle` may be ending the very stream whose finalizer stops it.
    const stop = Ref.getAndSet(fiber, null).pipe(
      Effect.flatMap((running) =>
        running === null ? Effect.void : Effect.asVoid(Effect.forkDetach(Fiber.interrupt(running))),
      ),
    );

    return { touch, start, stop } satisfies TurnInactivityWatchdog;
  });
