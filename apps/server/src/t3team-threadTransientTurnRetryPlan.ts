/**
 * Decides what to do when a run failed transiently, from DURABLE thread state
 * only: the attempt count is the number of consecutive retry runs that led to
 * the failed run (runs whose user message is a retry message). A user message
 * or a successful run breaks the chain, so the budget resets by itself and
 * survives restarts — no in-memory tracker.
 *
 * @module t3team-threadTransientTurnRetryPlan
 */
import { MessageId, type OrchestrationV2Run, type RunId } from "@t3tools/contracts";

import type { TransientRunFailure } from "./orchestration-v2/t3team-transientRunFailure.ts";
import {
  maxTransientRetries,
  transientRetryExhaustedText,
  transientRetryInFlightText,
  transientRetryReason,
} from "./t3team-threadTransientTurnRetryPolicy.ts";

const RETRY_MESSAGE_PREFIX = "t3team-transient-retry:";

/** The continuation message of the retry of `runId` (deterministic: one retry per failed run). */
export const transientRetryMessageId = (runId: RunId) =>
  MessageId.make(`${RETRY_MESSAGE_PREFIX}${runId}`);

/** The thread note announcing the retry (or exhaustion) of `runId`. */
export const transientRetryNoteId = (runId: RunId) =>
  MessageId.make(`t3team-transient-retry-note:${runId}`);

export type TransientRetryPlan =
  | {
      readonly kind: "retry";
      readonly attempt: number;
      readonly delayMs: number;
      readonly note: string;
    }
  | { readonly kind: "exhausted"; readonly note: string };

/** Retry runs immediately preceding (and including) `failedRunId`, newest first. */
export const priorRetryAttempts = (
  runs: ReadonlyArray<Pick<OrchestrationV2Run, "id" | "ordinal" | "userMessageId">>,
  failedRunId: RunId,
): number => {
  const ordered = [...runs].toSorted((left, right) => right.ordinal - left.ordinal);
  const start = ordered.findIndex((run) => run.id === failedRunId);
  if (start < 0) return 0;
  let attempts = 0;
  for (const run of ordered.slice(start)) {
    if (!run.userMessageId.startsWith(RETRY_MESSAGE_PREFIX)) break;
    attempts += 1;
  }
  return attempts;
};

export const planTransientRetry = (input: {
  readonly runs: ReadonlyArray<Pick<OrchestrationV2Run, "id" | "ordinal" | "userMessageId">>;
  readonly failedRunId: RunId;
  readonly failure: TransientRunFailure;
  readonly delayMs: (attempt: number, directiveSeconds: number | null, outage: boolean) => number;
}): TransientRetryPlan => {
  const reason = transientRetryReason(input.failure);
  const attempt = priorRetryAttempts(input.runs, input.failedRunId) + 1;
  const max = maxTransientRetries(input.failure.outage);
  if (attempt > max) {
    return { kind: "exhausted", note: transientRetryExhaustedText(reason, max) };
  }
  const delayMs = input.delayMs(attempt, input.failure.directiveSeconds, input.failure.outage);
  return {
    kind: "retry",
    attempt,
    delayMs,
    note: transientRetryInFlightText(attempt, reason, delayMs, max),
  };
};
