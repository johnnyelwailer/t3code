/**
 * Transient-failure auto-resume (flag `TRANSIENT_AUTO_RESUME`): instead of sleeping in memory
 * and giving up after the session budget, the transient-turn retry ARMS
 * `thread.transientRecovery {runId, nextTryAt}` for every failed run it owns, and the durable
 * sweep (`t3team-transientAutoResumeSweep.ts`) continues the run when it is due — the in-budget
 * ladder first, then a long backoff for as long as the user leaves auto-resume on.
 *
 * One timeline row per failure episode: the note is keyed by the episode's FIRST failed run and
 * rewritten in place on every cycle; the composer banner carries the live countdown.
 *
 * @module t3team-transientAutoResume
 */
import {
  CommandId,
  type MessageId,
  type OrchestrationV2Run,
  type OrchestrationV2ServerCommand,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { TransientRunFailure } from "./orchestration-v2/t3team-transientRunFailure.ts";
import {
  maxTransientRetries,
  providerUnreachableText,
  transientRetryReason,
} from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  priorRetryAttempts,
  transientRetryNoteId,
  type TransientRetryPlan,
} from "./t3team-threadTransientTurnRetryPlan.ts";

/** Waits between auto-resume attempts once the session budget is spent; the last step repeats. */
const AUTO_RESUME_BACKOFF_MS = [300_000, 600_000, 900_000, 1_800_000] as const;

/** Wait before auto-resume cycle `cycle` (1-based, counted past the session budget). */
export const autoResumeDelayMs = (cycle: number): number =>
  AUTO_RESUME_BACKOFF_MS[Math.max(0, Math.min(cycle - 1, AUTO_RESUME_BACKOFF_MS.length - 1))]!;

type ChainRun = Pick<OrchestrationV2Run, "id" | "ordinal" | "userMessageId">;

/** The first failed run of the retry chain that ends at `failedRunId`. */
export const episodeRootRunId = (runs: ReadonlyArray<ChainRun>, failedRunId: RunId): RunId => {
  const ordered = [...runs].toSorted((left, right) => right.ordinal - left.ordinal);
  const start = ordered.findIndex((run) => run.id === failedRunId);
  if (start < 0) return failedRunId;
  const attempts = priorRetryAttempts(runs, failedRunId);
  return (ordered[start + attempts] ?? ordered[start + attempts - 1])?.id ?? failedRunId;
};

const waitText = (delayMs: number): string => {
  const seconds = Math.max(1, Math.round(delayMs / 1000));
  return seconds >= 120 ? `${Math.round(seconds / 60)}m` : `${seconds}s`;
};

export function autoResumeNoteText(reason: string, max: number, delayMs: number): string {
  return `${reason} — automatic retries exhausted (${max} attempts); auto-resume tries again in ~${waitText(delayMs)}`;
}

export interface TransientAutoResumeDeps {
  readonly dispatch: (command: OrchestrationV2ServerCommand) => Effect.Effect<unknown, string>;
  readonly recordNote: (input: {
    readonly threadId: ThreadId;
    readonly messageId: MessageId;
    readonly text: string;
  }) => Effect.Effect<unknown, string>;
}

/** Notes the episode (in place) and arms the durable continuation of the failed `runId`. */
export const armTransientAutoResume = (
  deps: TransientAutoResumeDeps,
  input: {
    readonly threadId: ThreadId;
    readonly runs: ReadonlyArray<ChainRun>;
    readonly runId: RunId;
    readonly failure: TransientRunFailure;
    readonly plan: TransientRetryPlan;
  },
) =>
  Effect.gen(function* () {
    const { plan } = input;
    const unreachable = input.failure.unreachable === true;
    const max = maxTransientRetries(input.failure.outage, unreachable);
    const cycle = priorRetryAttempts(input.runs, input.runId) + 1 - max;
    const delayMs = plan.kind === "retry" ? plan.delayMs : autoResumeDelayMs(cycle);
    yield* deps.recordNote({
      threadId: input.threadId,
      messageId: transientRetryNoteId(episodeRootRunId(input.runs, input.runId)),
      text:
        plan.kind === "retry"
          ? plan.note
          : unreachable
            ? providerUnreachableText(transientRetryReason(input.failure), delayMs)
            : autoResumeNoteText(transientRetryReason(input.failure), max, delayMs),
    });
    const now = yield* DateTime.now;
    yield* deps.dispatch({
      type: "thread.metadata.update",
      commandId: CommandId.make(`server:t3team:transient-arm:${input.runId}`),
      threadId: input.threadId,
      transientRecovery: {
        runId: input.runId,
        nextTryAt: DateTime.formatIso(DateTime.add(now, { milliseconds: delayMs })),
      },
    });
  });
