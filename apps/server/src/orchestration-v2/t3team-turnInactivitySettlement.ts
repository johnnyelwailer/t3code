/**
 * How the turn-inactivity watchdog settles a run: it feeds synthetic provider events into the
 * run's own event pipeline (merged after ownership routing), so the stall is ingested, finalized
 * and its failure item written exactly like a provider-reported failure (an unacknowledged Stop
 * like a provider-reported `interrupted`). A root provider turn the provider left `running` is
 * closed as `failed` first — the provider never answered.
 *
 * @module t3team-turnInactivitySettlement
 */
import type {
  OrchestrationV2ProviderFailure,
  OrchestrationV2ProviderTurn,
  RunAttemptId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";
import { makeProviderFailure } from "./ProviderFailure.ts";

type TerminalEvent = Extract<ProviderAdapterV2Event, { readonly type: "turn.terminal" }>;
export type SettleCode = "turn_inactivity" | "interrupt_no_terminal";

/** How the watchdog settles a run; `failure` describes what happened (logged when interrupted). */
export interface TurnInactivityOutcome {
  readonly status: "failed" | "interrupted";
  readonly failure: OrchestrationV2ProviderFailure;
}

export const stallFailure = (budgetMs: number) =>
  makeProviderFailure({
    class: "transport_error",
    code: "turn_inactivity",
    retryable: true,
    message: `Turn stalled: no provider stream activity for ${Math.round(budgetMs / 1000)} seconds.`,
  });

/** A stall fails retryably; a Stop the provider never acknowledged ends as the user's Stop. */
export const outcomeFor = (code: SettleCode, budgetMs: number): TurnInactivityOutcome =>
  code === "turn_inactivity"
    ? { status: "failed", failure: stallFailure(budgetMs) }
    : {
        status: "interrupted",
        failure: makeProviderFailure({
          class: "transport_error",
          code: "interrupt_no_terminal",
          message: "The provider did not finish the turn after it was stopped.",
        }),
      };

export const makeTurnInactivitySettlement = (attemptId: RunAttemptId) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ProviderAdapterV2Event>();
    const rootTurn = yield* Ref.make<OrchestrationV2ProviderTurn | null>(null);
    return {
      /** Synthetic events; merge into the routed provider stream. */
      events: Stream.fromQueue(queue),
      /** Remembers the run's root provider turn from the routed stream. */
      observe: (event: ProviderAdapterV2Event) =>
        event.type === "provider_turn.updated" && event.providerTurn.runAttemptId === attemptId
          ? Ref.set(rootTurn, event.providerTurn)
          : Effect.void,
      /**
       * Settles the run `failed` with `failedTerminal`, or — for a Stop the provider never
       * acknowledged — `interrupted` with the same identity, so the user's Stop stays resumable.
       */
      settle: (status: "failed" | "interrupted", failedTerminal: TerminalEvent) =>
        Effect.gen(function* () {
          const terminal: TerminalEvent =
            status === "failed"
              ? failedTerminal
              : {
                  type: "turn.terminal",
                  driver: failedTerminal.driver,
                  providerThreadId: failedTerminal.providerThreadId,
                  providerTurnId: failedTerminal.providerTurnId,
                  runOrdinal: failedTerminal.runOrdinal,
                  status: "interrupted",
                  failure: null,
                  threadDisposition: failedTerminal.threadDisposition,
                };
          const turn = yield* Ref.get(rootTurn);
          if (turn !== null && turn.completedAt === null) {
            yield* Queue.offer(queue, {
              type: "provider_turn.updated",
              driver: terminal.driver,
              providerTurn: { ...turn, status: "failed", completedAt: yield* DateTime.now },
            });
          }
          yield* Queue.offer(queue, {
            ...terminal,
            providerTurnId: turn?.id ?? terminal.providerTurnId,
          });
        }),
    };
  });
