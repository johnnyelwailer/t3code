/**
 * Bounded re-drive of a `thread.turn` step whose provider turn never answered — constants,
 * backoff ladder, prompt-lookup helper, and the shared type contracts (split out of
 * `t3team-workflowEngineTurnRetry.ts`).
 *
 * Background: a durable run parked on such an ask has no reply text at its settle. Settling it
 * with `""`, or failing the run on the spot, throws the step away: nothing about the body is
 * broken — the agent simply never got to finish. The host instead re-drives the SAME step —
 * same correlation id, the same prompt message, through the existing `thread.turn.resume`
 * command the Continue button uses — with backoff, up to
 * {@link MAX_INTERRUPTED_TURN_REDRIVES} attempts. Only when the budget is spent does the run
 * fail through the normal funnel, and the reason then names the step and, for a failed turn,
 * the provider's own error.
 *
 * The budget is journaled ON THE RUN (`workflow_runs.turn_retries`, migration 052) and
 * seeded into the rehydrated pending ask at boot (`t3team-workflowEngineRehydrate.ts`) — never
 * in the in-memory registry alone — so a second restart does not reset the counter.
 *
 * @module t3team-workflowEngineTurnRetrySupport
 */
import {
  type OrchestrationCommand,
  type OrchestrationThread,
  type T3TeamMessageWorkflowAuthor,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";
import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import type {
  T3TeamWorkflowEngineRegistryShape,
  WorkflowPendingAsk,
  WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";

/** The settle reason when a turn ends without a word of reply text (the run's error text). */
export const NO_TEXT_MESSAGE =
  "The agent turn ended without any reply text, so this step has no answer to return.";

/** The run's error text when a step's provider turn failed (the session died with `error`). */
export function failedTurnMessage(error: string): string {
  return `The agent turn failed: ${error}`;
}

/** Max re-drive attempts for one interrupted step before the run fails. */
export const MAX_INTERRUPTED_TURN_REDRIVES = 3;

/** Backoff ladder (ms) before re-drive attempts 1, 2, 3. */
export const INTERRUPTED_TURN_RETRY_BACKOFF_MS = [5_000, 30_000, 120_000] as const;

/** Hard cap for the env override — the longest ladder step is the longest "transient" wait. */
const MAX_RETRY_BACKOFF_OVERRIDE_MS = INTERRUPTED_TURN_RETRY_BACKOFF_MS[2]!;

/** The run's error text when the step's prompt can no longer be found on the thread. */
export const PROMPT_LOST_ERROR =
  "The interrupted step can no longer be re-driven: its prompt is not the thread's last user message.";

/**
 * Backoff before re-drive attempt `attempt` (0-based: 0 -> 5s, 1 -> 30s, 2 -> 120s). The env
 * override (`T3TEAM_INTERRUPTED_TURN_RETRY_BACKOFF_MS`, positive finite ms, capped) exists so
 * e2e verification can shorten the wait without waiting real minutes — the same pattern as the
 * session-level transient turn retry's `T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS`.
 */
export function interruptedTurnRetryBackoffMs(attempt: number, overrideMs?: number): number {
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs > 0) {
    return Math.min(Math.round(overrideMs), MAX_RETRY_BACKOFF_OVERRIDE_MS);
  }
  const index = Math.max(0, Math.min(attempt, INTERRUPTED_TURN_RETRY_BACKOFF_MS.length - 1));
  return INTERRUPTED_TURN_RETRY_BACKOFF_MS[index]!;
}

/**
 * The prompt message a re-drive re-issues: the LAST user message on the thread stamped with
 * this run + step's workflow author. `thread.turn.resume` can only re-run a thread's LAST user
 * message, so anything newer on the thread (a human steer, another prompt) means the step can
 * no longer be re-driven where it sits.
 */
export function findInterruptedStepPrompt(
  thread: OrchestrationThread,
  runId: string,
  stepId: string,
): { readonly messageId: string; readonly author: T3TeamMessageWorkflowAuthor } | null {
  for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
    const message = thread.messages[i];
    if (message === undefined || message.role !== "user") continue;
    const author = message.t3teamExt?.author;
    if (author?.kind !== "workflow" || author.workflowRunId !== runId || author.stepId !== stepId)
      continue;
    return { messageId: message.id, author };
  }
  return null;
}

export interface InterruptedTurnRetryDeps {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  /** Read the projected thread detail (the prompt-message lookup + the busy check). */
  readonly readThread: (
    threadId: string,
  ) => Effect.Effect<Option.Option<OrchestrationThread>, ProjectionRepositoryError>;
  /** Journal the re-drive attempt on the run row — the cross-restart half of the budget. */
  readonly recordTurnRetries: (
    runId: string,
    turnRetries: number,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Queue the re-drive on the serial lane, after the backoff. */
  readonly armTurnRetry: (
    threadId: string,
    correlationId: string,
    delayMs: number,
  ) => Effect.Effect<void>;
  /** Dispatch the `thread.turn.resume` re-drive. */
  readonly dispatch: (
    command: OrchestrationCommand,
  ) => Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchError>;
  /** e2e backoff override (env); absent in production wiring. */
  readonly backoffOverrideMs?: number;
}

export interface InterruptedTurnRetry {
  /**
   * A NO-TEXT settle of a durable ask whose turn was interrupted (its pending carries the
   * journaled `turnRetries` count). Schedules the next re-drive, or fails the run when the
   * budget is spent.
   */
  readonly settleNoText: (
    threadId: string,
    pending: WorkflowPendingAsk,
    run: WorkflowRegisteredRun,
  ) => Effect.Effect<void>;
  /**
   * A FAILED-TURN settle (the session died with `error`; `error` is the provider's reason).
   * Schedules the next re-drive — live or rehydrated ask alike — or fails the run with the
   * provider's reason when the budget is spent.
   */
  readonly settleFailedTurn: (
    threadId: string,
    pending: WorkflowPendingAsk,
    run: WorkflowRegisteredRun,
    error: string,
  ) => Effect.Effect<void>;
  /** The due re-drive: re-validate, then re-issue the step's prompt turn. */
  readonly processTurnRetry: (input: {
    readonly threadId: string;
    readonly correlationId: string;
  }) => Effect.Effect<void>;
}
