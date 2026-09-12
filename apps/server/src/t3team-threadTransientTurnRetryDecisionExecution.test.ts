/**
 * GHE #157 follow-up — terminal re-emission guard (Fix 3i): the transient-retry
 * "retry" path must NOT re-issue a `thread.session.set` when the session is
 * already in a terminal status (a later terminal event settled it during the
 * backoff settle). Re-issuing would overwrite the terminal status and fire a
 * duplicate terminal event for the child-wait reactor.
 */
import {
  type OrchestrationSession,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import {
  executeTransientRetryDecision,
  type DecisionExecutionDeps,
} from "./t3team-threadTransientTurnRetryDecisionExecution.ts";
import type {
  TransientTurnRetryDecision,
  TransientTurnRetryState,
} from "./t3team-threadTransientTurnRetryDecision.ts";

const THREAD_ID = "thread-retry";

const baseThread = (status: OrchestrationSession["status"]): OrchestrationThread =>
  ({
    id: THREAD_ID,
    messages: [],
    latestTurn: null,
    session: {
      threadId: THREAD_ID,
      status,
      providerName: "codex",
      activeTurnId: null,
      lastError: "provider stream stalled",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }) as unknown as OrchestrationThread;

const RETRY_DECISION: TransientTurnRetryDecision = {
  kind: "retry",
  attempt: 1,
  reason: "Provider stream stalled (no activity for 600s)",
  inFlightText: "Retrying (1/3) — Provider stream stalled (no activity for 600s)",
  delayMs: 1,
};

const trackerState = (attempts: number): Map<string, TransientTurnRetryState> =>
  new Map([
    [
      THREAD_ID,
      { attempts, stall: null, userStopped: false, lastTerminal: "transient" },
    ],
  ]);

// Run the decision (which sleeps for the settle + backoff) against the TestClock
// provided by @effect/vitest: fork it, advance the virtual clock, then await.
const runDecision = (deps: DecisionExecutionDeps) =>
  Effect.gen(function* () {
    const fiber = yield* executeTransientRetryDecision(
      deps,
      THREAD_ID,
      RETRY_DECISION,
    ).pipe(Effect.forkScoped);
    // Advance the virtual clock and yield so the forked decision (which sleeps
    // for the settle + backoff) runs to completion.
    for (let i = 0; i < 50; i += 1) {
      yield* TestClock.adjust("10 seconds");
      yield* Effect.yieldNow;
    }
    yield* Fiber.join(fiber);
  });

describe("executeTransientRetryDecision — terminal re-emission guard", () => {
  it.effect("does NOT re-issue session.set when the session is already terminal", () =>
    Effect.gen(function* () {
      const sessionSets: OrchestrationSession[] = [];
      const resumes: Array<{ threadId: string; messageId: string }> = [];
      const deps: DecisionExecutionDeps = {
        loadThread: () => Effect.succeed(Option.some(baseThread("interrupted"))),
        dispatchSessionSet: (_threadId, session) =>
          Effect.sync(() => {
            sessionSets.push(session);
          }),
        dispatchResume: (threadId, messageId) =>
          Effect.sync(() => {
            resumes.push({ threadId, messageId });
          }),
        trackerState: trackerState(1),
      };
      yield* runDecision(deps);
      // Terminal status: the session.set re-issue is skipped entirely.
      expect(sessionSets).toHaveLength(0);
      expect(resumes).toHaveLength(0);
    }),
  );

  it.effect("re-issues session.set when the session is still running", () =>
    Effect.gen(function* () {
      const sessionSets: OrchestrationSession[] = [];
      const deps: DecisionExecutionDeps = {
        loadThread: () => Effect.succeed(Option.some(baseThread("running"))),
        dispatchSessionSet: (_threadId, session) =>
          Effect.sync(() => {
            sessionSets.push(session);
          }),
        dispatchResume: () => Effect.void,
        trackerState: trackerState(1),
      };
      yield* runDecision(deps);
      // Non-terminal status: the in-flight "retrying" session.set is issued.
      expect(sessionSets).toHaveLength(1);
      expect(sessionSets[0]?.status).toBe("running");
      expect(sessionSets[0]?.lastError).toContain("Retrying (1/3)");
    }),
  );
});
