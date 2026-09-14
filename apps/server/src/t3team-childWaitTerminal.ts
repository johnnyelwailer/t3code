/**
 * Terminal-decision path for the durable child-wait reactor (GHE #55): given a
 * child that just went terminal, decide what (if anything) to tell the parent.
 *
 * - Abnormal stops (failed/aborted) ALWAYS notify — otherwise a dead child is
 *   silent (GHE #157). They are genuine terminals, so the reactor calls this
 *   immediately.
 * - A SILENT completion (completed) notifies ONLY when the parent received
 *   nothing from the child; the notifier decides that from the parent's
 *   durable transcript, so a stuck child can't hide a finished one. `ready`/
 *   `idle` is NOT terminal (a multi-turn agent goes running -> ready -> running
 *   between turns), so the reactor defers this outcome behind a quiet period
 *   and only calls this path once the child has stayed quiet.
 *
 * Both outcomes route through the SAME ledger-guarded `notifyAbnormalStop`, so
 * each fires once per terminal epoch (re-armed on the child's resume) — one
 * durable marker, both outcomes.
 *
 * Split from t3team-childWaitReactor.ts so that file keeps only the live
 * wiring (rehydrate, wait resolution, host timers). No logic lives here that
 * the reactor does not invoke.
 *
 * @module t3team-childWaitTerminal
 */
import * as Effect from "effect/Effect";

import { childWaitOutcomeMatches, type ChildWaitOutcome } from "./t3team-childWait.ts";
import type { ChildWaitIndex } from "./t3team-childWaitIndex.ts";
import type { ResolveWait } from "./t3team-childWaitResolve.ts";
import type { ChildTerminalOutcome } from "./t3team-childAbnormalStopNotify.ts";

export type TerminalOutcome = "completed" | "failed" | "aborted";

/** Resolves matching pending waits for a child+outcome; returns how many. */
export type ResolveChildOutcome = (
  childThreadId: string,
  outcome: ChildWaitOutcome,
) => Effect.Effect<number>;

/** A terminal outcome + the fields the ledger-guarded notifier needs. */
export interface NotifyTerminalIfNoWaitInput {
  readonly childThreadId: string;
  readonly outcome: TerminalOutcome;
  readonly lastError: string | null | undefined;
  readonly eventSequence: number;
}

/** The runtime deps the reactor supplies (live index + resolver + notifier). */
export interface ChildWaitTerminalDeps {
  readonly index: ChildWaitIndex;
  readonly resolveWait: ResolveWait;
  readonly notifyAbnormalStop: (input: {
    readonly childThreadId: string;
    readonly outcome: ChildTerminalOutcome;
    readonly lastError: string | null | undefined;
    readonly eventSequence: number;
  }) => Effect.Effect<void>;
}

export function makeChildWaitTerminal(deps: ChildWaitTerminalDeps) {
  const { index, resolveWait, notifyAbnormalStop } = deps;

  // Resolves matching pending waits; returns how many (so the caller can dedup).
  const resolveChildOutcome = (
    childThreadId: string,
    outcome: ChildWaitOutcome,
  ): Effect.Effect<number> =>
    Effect.gen(function* () {
      const matching = index
        .forChild(childThreadId)
        .filter((record) => childWaitOutcomeMatches(outcome, record.on));
      for (const record of matching) {
        yield* resolveWait(record, outcome);
      }
      return matching.length;
    });

  // Terminal outcome with no wait resolved for the child: tell the parent.
  // Abnormal stops (failed/aborted) always notify (GHE #157); a SILENT
  // completion notifies only when the parent received nothing from the child.
  // Both route through the ledger-guarded notifier, so each fires once per
  // terminal epoch (re-armed on the child's resume).
  const notifyTerminalIfNoWait = (input: NotifyTerminalIfNoWaitInput): Effect.Effect<void> =>
    resolveChildOutcome(input.childThreadId, input.outcome).pipe(
      Effect.flatMap((resolvedWaits) => {
        // A wait already resolved for this child+outcome told the parent — no second message.
        if (resolvedWaits > 0) return Effect.void;
        return notifyAbnormalStop(input);
      }),
    );

  return { resolveChildOutcome, notifyTerminalIfNoWait };
}
