/**
 * Bounded re-drive of a `thread.turn` step the host INTERRUPTED mid-turn (a desktop restart or
 * kill while the agent was working).
 *
 * A durable run parked on a `thread.turn` ask whose provider turn died with the host has no
 * reply text at its boot settle. Settling it with `""`, or failing the run on the spot, throws
 * the step away: nothing about the body is broken — the agent simply never got to finish. The
 * host instead re-drives the SAME step — same correlation id, the same prompt message, through
 * the existing `thread.turn.resume` command the Continue button uses — with backoff, up to
 * {@link MAX_INTERRUPTED_TURN_REDRIVES} attempts. Only when the budget is spent does the run
 * fail through the normal funnel, and the reason then carries the step id.
 *
 * The budget is journaled ON THE RUN (`workflow_runs.turn_retries`, migration 052) and
 * seeded into the rehydrated pending ask at boot (`t3team-workflowEngineRehydrate.ts`) — never
 * in the in-memory registry alone — so a second restart does not reset the counter. A step
 * parked on a LIVE ask (set by the broker this uptime, no `turnRetries`) keeps its old
 * behaviour: a turn that ends without a word still fails the run instead of retrying.
 */

import {
  CommandId,
  MessageId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThread,
  type T3TeamMessageWorkflowAuthor,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";
import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

import type {
  T3TeamWorkflowEngineRegistryShape,
  WorkflowPendingAsk,
  WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";

/** The settle reason when a turn ends without a word of reply text (the run's error text). */
export const NO_TEXT_MESSAGE =
  "The agent turn ended without any reply text, so this step has no answer to return.";

/** Max re-drive attempts for one interrupted step before the run fails. */
export const MAX_INTERRUPTED_TURN_REDRIVES = 3;

/** Backoff ladder (ms) before re-drive attempts 1, 2, 3. */
export const INTERRUPTED_TURN_RETRY_BACKOFF_MS = [5_000, 30_000, 120_000] as const;

/** Hard cap for the env override — the longest ladder step is the longest "transient" wait. */
const MAX_RETRY_BACKOFF_OVERRIDE_MS = INTERRUPTED_TURN_RETRY_BACKOFF_MS[2]!;

const PROMPT_LOST_ERROR =
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
  /** The due re-drive: re-validate, then re-issue the step's prompt turn. */
  readonly processTurnRetry: (input: {
    readonly threadId: string;
    readonly correlationId: string;
  }) => Effect.Effect<void>;
}

export function makeInterruptedTurnRetry(deps: InterruptedTurnRetryDeps): InterruptedTurnRetry {
  /** The host-side fail funnel — the SAME closure a thrown body error takes. */
  const failRun = (
    run: WorkflowRegisteredRun,
    correlationId: string,
    error: unknown,
  ): Effect.Effect<void> =>
    Effect.promise(() =>
      run.fail === undefined ? run.resume(correlationId, "") : run.fail(error),
    );

  const readThreadSafe = (threadId: string): Effect.Effect<Option.Option<OrchestrationThread>> =>
    deps.readThread(threadId).pipe(
      // A read that cannot land cannot VERIFY the prompt; treat it as "thread unavailable"
      // (the caller then fails the run — parking it would hide the failure forever).
      Effect.catchCause(() => Effect.succeed(Option.none())),
    );

  const promptFor = (threadId: string, pending: WorkflowPendingAsk) =>
    Effect.gen(function* () {
      const thread = Option.getOrUndefined(yield* readThreadSafe(threadId));
      return thread === undefined
        ? null
        : findInterruptedStepPrompt(thread, pending.runId, pending.correlationId);
    });

  return {
    settleNoText: Effect.fn("InterruptedTurnRetry.settleNoText")(
      function* (threadId, pending, run) {
        const attempts = pending.turnRetries ?? 0;
        if (attempts >= MAX_INTERRUPTED_TURN_REDRIVES) {
          yield* Effect.logWarning("t3team workflow interrupted step re-drive budget exhausted", {
            threadId,
            runId: pending.runId,
            stepId: pending.correlationId,
            attempts,
          });
          yield* failRun(
            run,
            pending.correlationId,
            new Error(`${NO_TEXT_MESSAGE} (step ${pending.correlationId})`),
          );
          return;
        }
        const prompt = yield* promptFor(threadId, pending);
        if (prompt === null) {
          yield* failRun(run, pending.correlationId, new Error(PROMPT_LOST_ERROR));
          return;
        }
        // Re-register the SAME ask under the SAME correlation: the re-driven turn's reply
        // settles through the ordinary path and resumes the run on this step. The author is
        // restored from the prompt's stamp so the re-driven answer keeps its attribution.
        deps.registry.setPending(threadId, {
          ...pending,
          turnRetries: attempts + 1,
          author: prompt.author,
        });
        // Journaling the attempt on the run row is the cross-restart half of the budget; a
        // failed journal write means the next restart hands the step a fresh budget, so
        // fail-toward-retry: log, keep arming.
        yield* deps.recordTurnRetries(pending.runId, attempts + 1).pipe(
          Effect.catchCause(() =>
            Effect.logWarning("t3team workflow re-drive attempt could not be journaled", {
              threadId,
              runId: pending.runId,
              stepId: pending.correlationId,
              attempt: attempts + 1,
            }),
          ),
        );
        const delayMs = interruptedTurnRetryBackoffMs(attempts, deps.backoffOverrideMs);
        yield* Effect.logInfo("t3team workflow interrupted step re-drive scheduled", {
          threadId,
          runId: pending.runId,
          stepId: pending.correlationId,
          attempt: attempts + 1,
          maxAttempts: MAX_INTERRUPTED_TURN_REDRIVES,
          delayMs,
        });
        yield* deps.armTurnRetry(threadId, pending.correlationId, delayMs);
      },
    ),

    processTurnRetry: Effect.fn("InterruptedTurnRetry.processTurnRetry")(function* ({
      threadId,
      correlationId,
    }) {
      const pending = deps.registry.peekPending(threadId);
      if (
        pending?.kind !== "thread.turn" ||
        pending.correlationId !== correlationId ||
        pending.resolveLive !== undefined
      )
        return; // the ask moved on (replied, advanced, cancelled) — nothing to re-drive
      const run = deps.registry.getRun(pending.runId);
      if (run === undefined) return;

      const thread = Option.getOrUndefined(yield* readThreadSafe(threadId));
      const prompt =
        thread === undefined
          ? null
          : findInterruptedStepPrompt(thread, pending.runId, correlationId);
      if (prompt === null) {
        yield* failRun(run, correlationId, new Error(PROMPT_LOST_ERROR));
        return;
      }
      // A turn began while we waited (a human steer, another automation): its own settle
      // decides this step — do not stack a second turn on top of it.
      const status = thread?.session?.status;
      if (status === "running" || status === "starting") {
        yield* Effect.logInfo("t3team workflow interrupted step re-drive skipped: thread busy", {
          threadId,
          stepId: correlationId,
          status,
        });
        return;
      }
      const command: OrchestrationCommand = {
        type: "thread.turn.resume",
        commandId: CommandId.make(`server:t3team:wf-turn-retry:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(threadId),
        messageId: MessageId.make(prompt.messageId),
        createdAt: DateTime.formatIso(yield* DateTime.now),
      };
      yield* deps.dispatch(command).pipe(
        Effect.catch((error) => {
          // Decider invariant: a turn is ALREADY in progress — that turn's own settle will
          // decide this step, so leave it parked (fail-open, as the transient turn retry).
          if (
            error._tag === "OrchestrationCommandInvariantError" &&
            error.detail.includes("turn in progress")
          ) {
            return Effect.logInfo(
              "t3team workflow interrupted step re-drive skipped: turn in progress",
              { threadId, stepId: correlationId },
            );
          }
          // Any other dispatch failure cannot recover on its own (nothing else will settle
          // this ask): fail the run instead of parking it forever.
          return Effect.logWarning("t3team workflow interrupted step re-drive dispatch failed", {
            threadId,
            stepId: correlationId,
            error: error.message,
          }).pipe(
            Effect.andThen(
              failRun(
                run,
                correlationId,
                new Error(`The interrupted step could not be re-driven: ${error.message}`),
              ),
            ),
          );
        }),
        Effect.andThen(() =>
          Effect.logInfo("t3team workflow interrupted step re-issued", {
            threadId,
            stepId: correlationId,
            attempt: pending.turnRetries ?? 0,
          }),
        ),
      );
    }),
  };
}
