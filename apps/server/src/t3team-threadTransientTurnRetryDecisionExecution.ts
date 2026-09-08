/**
 * Decision execution for session-level transient-turn retry (split out of
 * the Live layer in `t3team-threadTransientTurnRetry.ts` for the additive
 * LOC budget): persists the stop reason on the thread session and dispatches
 * `thread.turn.resume` after a bounded backoff. All dispatches fail-open.
 *
 * @module t3team-threadTransientTurnRetryDecisionExecution
 */
import {
  type OrchestrationSession,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { IN_FLIGHT_SETTLE_MS } from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  type TransientTurnRetryDecision,
  type TransientTurnRetryState,
} from "./t3team-threadTransientTurnRetryDecision.ts";

export interface DecisionExecutionDeps {
  readonly loadThread: (threadId: string) => Effect.Effect<Option.Option<OrchestrationThread>>;
  readonly dispatchSessionSet: (
    threadId: string,
    session: OrchestrationSession,
  ) => Effect.Effect<unknown, unknown>;
  readonly dispatchResume: (
    threadId: string,
    messageId: string,
  ) => Effect.Effect<unknown, unknown>;
  readonly trackerState: Map<string, TransientTurnRetryState>;
}

export function executeTransientRetryDecision(
  deps: DecisionExecutionDeps,
  threadId: string,
  decision: TransientTurnRetryDecision,
): Effect.Effect<void> {
  const { loadThread, dispatchSessionSet, dispatchResume, trackerState } = deps;

  const lastUserMessageId = (thread: OrchestrationThread): string | null => {
    for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
      const message = thread.messages[i];
      if (message !== undefined && message.role === "user") return message.id;
    }
    return null;
  };

  const resumableShape = (thread: OrchestrationThread, messageId: string): boolean => {
    const lastMessage = thread.messages.at(-1);
    const lastTurnIncomplete =
      thread.latestTurn !== null &&
      (thread.latestTurn.state === "interrupted" || thread.latestTurn.state === "error");
    return (lastMessage?.id === messageId || lastTurnIncomplete) && thread.messages.length > 0;
  };

  const sessionFrom = (
    thread: OrchestrationThread,
    lastError: string,
  ): OrchestrationSession | null => {
    if (thread.session === null) return null;
    return {
      ...thread.session,
      lastError,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    };
  };

  return Effect.gen(function* () {
    const d = decision;
    if (d === undefined) return;
    if (d.kind === "persist-reason") {
      const thread = Option.getOrUndefined(yield* loadThread(threadId));
      if (thread === undefined) return;
      if (thread.session?.lastError !== null && thread.session?.lastError !== undefined) return;
      const session = sessionFrom(thread, d.reason);
      if (session === null) return;
      yield* dispatchSessionSet(threadId, session).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("transient-retry: persist stop reason failed", {
            threadId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
      return;
    }
    if (d.kind === "exhausted") {
      yield* Effect.sleep(Duration.millis(IN_FLIGHT_SETTLE_MS));
      const exhaustedThread = Option.getOrUndefined(yield* loadThread(threadId));
      if (exhaustedThread === undefined) return;
      const session = sessionFrom(exhaustedThread, d.exhaustedText);
      if (session === null) return;
      yield* dispatchSessionSet(threadId, session).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("transient-retry: persist exhausted reason failed", {
            threadId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
      return;
    }

    // "retry"
    yield* Effect.sleep(Duration.millis(IN_FLIGHT_SETTLE_MS));
    const settled = Option.getOrUndefined(yield* loadThread(threadId));
    if (settled === undefined) return;
    const session = sessionFrom(settled, d.inFlightText);
    if (session === null) return;
    yield* dispatchSessionSet(threadId, session).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("transient-retry: persist in-flight reason failed", {
          threadId,
          cause: Cause.pretty(cause),
        }),
      ),
    );
    const episodeMessageId = lastUserMessageId(settled);
    if (episodeMessageId === null) return;

    yield* Effect.sleep(Duration.millis(d.delayMs));
    const fresh = Option.getOrUndefined(yield* loadThread(threadId));
    if (fresh === undefined) return;
    const status = fresh.session?.status;
    if (status === "running" || status === "starting") {
      yield* Effect.logInfo("transient-retry: re-validate bail", {
        threadId,
        why: "busy",
        status,
      });
      return;
    }
    if (lastUserMessageId(fresh) !== episodeMessageId) {
      yield* Effect.logInfo("transient-retry: re-validate bail", {
        threadId,
        why: "new-user-message",
        episodeMessageId,
        now: lastUserMessageId(fresh),
      });
      return;
    }
    if (trackerState.get(threadId)?.attempts !== d.attempt) {
      yield* Effect.logInfo("transient-retry: re-validate bail", {
        threadId,
        why: "attempts-mismatch",
        attempt: d.attempt,
        tracker: trackerState.get(threadId)?.attempts,
      });
      return;
    }
    if (!resumableShape(fresh, episodeMessageId)) {
      yield* Effect.logInfo("transient-retry: re-validate bail", {
        threadId,
        why: "not-resumable",
        lastMessageId: fresh.messages.at(-1)?.id,
        latestTurn: fresh.latestTurn,
      });
      return;
    }
    yield* Effect.logInfo("transient-retry: re-issuing turn after transient provider failure", {
      threadId,
      attempt: d.attempt,
      reason: d.reason,
    });
    yield* dispatchResume(threadId, episodeMessageId).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning(
          "transient-retry: resume dispatch failed; leaving thread for manual Continue",
          {
            threadId,
            attempt: d.attempt,
            cause: Cause.pretty(cause),
          },
        ),
      ),
    );
  });
}
