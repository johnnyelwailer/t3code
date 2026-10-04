/**
 * Live wiring for session-level transient-turn retry (split out of
 * `t3team-threadTransientTurnRetry.ts` for the additive LOC budget):
 * subscribes the tracker to the provider runtime event stream and the
 * orchestration domain event stream, then executes the tracker's decisions.
 *
 * @module t3team-threadTransientTurnRetryReactor
 */
// @effect-diagnostics globalTimers:off -- the retry backoff timer is owned
// by this reactor fiber (same host-timer pattern as t3team-childWaitScheduler).
import {
  CommandId,
  MessageId,
  ThreadId,
  type OrchestrationSession,
  type OrchestrationThread,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { transientTurnRetryDelayMs } from "./t3team-threadTransientTurnRetryPolicy.ts";
import { createTransientTurnRetryTracker } from "./t3team-threadTransientTurnRetryTracker.ts";
import {
  executeTransientRetryDecision,
  type DecisionExecutionDeps,
} from "./t3team-threadTransientTurnRetryDecisionExecution.ts";

export const T3TeamThreadTransientTurnRetryLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const providerService = yield* ProviderService;

    const backoffOverrideRaw = process.env.T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS;
    const backoffOverride =
      backoffOverrideRaw === undefined
        ? undefined
        : (() => {
            const parsed = Number.parseInt(backoffOverrideRaw, 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          })();

    const tracker = createTransientTurnRetryTracker({
      delayMs: (attempt, _reason, directiveSeconds) =>
        transientTurnRetryDelayMs(attempt, directiveSeconds, backoffOverride),
    });

    const loadThread = (threadId: string): Effect.Effect<Option.Option<OrchestrationThread>> =>
      query
        .getThreadDetailById(ThreadId.make(threadId))
        .pipe(Effect.orElseSucceed(() => Option.none()));

    const dispatchSessionSet = (threadId: string, session: OrchestrationSession) =>
      engine.dispatch({
        type: "thread.session.set",
        commandId: CommandId.make(`server:t3team:transient-retry:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(threadId),
        session,
        createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
      });

    const dispatchResume = (threadId: string, messageId: string) =>
      engine.dispatch({
        type: "thread.turn.resume",
        commandId: CommandId.make(`server:t3team:transient-retry:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(threadId),
        messageId: MessageId.make(messageId),
        createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
      });

    const decisionDeps: DecisionExecutionDeps = {
      loadThread,
      dispatchSessionSet,
      dispatchResume,
      trackerState: tracker.state,
    };

    const onRuntimeEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        const threadId = event.threadId;
        switch (event.type) {
          case "runtime.warning":
            tracker.onStallWarning(threadId, event.turnId, event.payload);
            return;
          case "turn.started":
            tracker.onTurnStarted(threadId);
            return;
          case "turn.aborted":
          case "turn.completed":
          case "session.exited": {
            const decision = tracker.onTurnTerminal(threadId, event.turnId, {
              type: event.type,
              payload: event.payload,
            });
            if (decision === undefined) return;
            yield* executeTransientRetryDecision(decisionDeps, threadId, decision).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("transient-retry: decision execution failed", {
                  threadId,
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
              ),
            );
            return;
          }
          default:
            return;
        }
      });

    const onDomainEvent = (event: {
      readonly type: string;
      readonly payload: unknown;
    }): Effect.Effect<void> =>
      Effect.gen(function* () {
        const payload = event.payload as { readonly threadId?: unknown } | null | undefined;
        if (typeof payload?.threadId !== "string") return;
        const threadId = payload.threadId;
        if (event.type === "thread.turn-interrupt-requested") {
          tracker.onInterruptRequested(threadId);
        } else if (event.type === "thread.message-sent") {
          const role = (payload as { role?: unknown }).role;
          if (role === "user") tracker.onUserMessage(threadId);
        }
      });

    yield* Effect.forkScoped(
      Stream.runForEach(providerService.streamEvents, onRuntimeEvent).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("transient-retry: runtime event stream failed", { cause }),
        ),
      ),
    );
    yield* Effect.forkScoped(
      Stream.runForEach(engine.streamDomainEvents, onDomainEvent).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("transient-retry: domain event stream failed", { cause }),
        ),
      ),
    );
  }),
);
