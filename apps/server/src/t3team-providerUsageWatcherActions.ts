/**
 * Release step of the provider usage watcher (GHE #421): claim a hold's
 * release, replay its pending turn once when that is still correct, restore
 * the hold when the replay could not be dispatched, and append the matching
 * thread activities.
 *
 * @module t3team-providerUsageWatcherActions
 */
import { CommandId, EventId, ThreadId, type OrchestrationThread } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProviderUsageHold as HoldRow } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  PROVIDER_USAGE_MAX_REPLAY_ATTEMPTS,
  type ProviderUsageHoldActivityKind,
  type ProviderUsageWatcherDeps,
} from "./t3team-providerUsageWatcherTypes.ts";

export const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

/** Activity appends are best-effort: a failed append never fails the watcher step. */
export const makeAppendActivity =
  (engine: Pick<OrchestrationEngineShape, "dispatch">) =>
  (
    threadId: string,
    kind: ProviderUsageHoldActivityKind,
    summary: string,
    payload: unknown,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const createdAt = yield* nowIso;
      yield* engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(t3teamRandomUUID()),
        threadId: ThreadId.make(threadId),
        activity: {
          id: EventId.make(t3teamRandomUUID()),
          tone: "info",
          kind,
          summary,
          payload,
          turnId: null,
          createdAt,
        },
        createdAt,
      });
    }).pipe(Effect.ignoreCause);

/**
 * A pending turn is replayed only while it is still the thread's open ask:
 * it is the latest user message, and no turn requested after it is running
 * or already completed (answered — also true after a restart).
 */
const isReplayable = (thread: OrchestrationThread, messageId: string): boolean => {
  const message = thread.messages.find((candidate) => candidate.id === messageId);
  if (message === undefined) return false;
  const lastUser = thread.messages.findLast((candidate) => candidate.role === "user");
  if (lastUser?.id !== messageId) return false;
  const latest = thread.latestTurn;
  if (latest === null || Date.parse(latest.requestedAt) < Date.parse(message.createdAt)) {
    return true;
  }
  return latest.state !== "running" && latest.state !== "completed";
};

/** Put a claimed hold back exactly as it was, so the next check retries it. */
const restoreHold = Effect.fn("providerUsageWatcher.restoreHold")(function* (
  deps: ProviderUsageWatcherDeps,
  claimed: HoldRow,
) {
  yield* deps.holds
    .upsertActiveHold({
      ...claimed,
      releasedAt: null,
      releaseReason: null,
      updatedAt: yield* nowIso,
    })
    .pipe(Effect.orDie);
  deps.state.heldThreads.set(claimed.threadId, {
    instanceId: claimed.providerInstanceId,
    since: claimed.since,
    resetsAt: claimed.resetsAt,
  });
});

/**
 * RELEASE one hold. The conditional `markReleased` is the claim: only the
 * caller that flips the row goes on, so a hold is replayed at most once even
 * when a deadline tick and a recovery snapshot race. `replay: false` clears
 * the hold without re-driving (the thread was answered some other way).
 *
 * A replay whose dispatch fails puts the hold back for the next check; after
 * {@link PROVIDER_USAGE_MAX_REPLAY_ATTEMPTS} failures the hold is released
 * with a visible activity asking the user to resend. Returns whether the hold
 * ended released.
 */
export const releaseHold = Effect.fn("providerUsageWatcher.releaseHold")(function* (
  deps: ProviderUsageWatcherDeps,
  row: Pick<HoldRow, "threadId">,
  input: { readonly reason: string; readonly replay: boolean },
) {
  const claimed = Option.getOrUndefined(
    yield* deps.holds
      .markReleased({ threadId: row.threadId, reason: input.reason, now: yield* nowIso })
      .pipe(Effect.orDie),
  );
  deps.state.heldThreads.delete(row.threadId);
  if (claimed === undefined) return false;
  let outcome: "resumed" | "skipped" | "gave-up" = "skipped";
  const messageId = claimed.pendingTurnMessageId;
  if (input.replay && claimed.autoResume && messageId !== null) {
    const thread = Option.getOrUndefined(
      yield* deps.query
        .getThreadDetailById(claimed.threadId)
        .pipe(Effect.orElseSucceed(() => Option.none())),
    );
    if (thread !== undefined && isReplayable(thread, messageId)) {
      const dispatched = yield* deps.engine
        .dispatch({
          type: "thread.turn.resume",
          commandId: CommandId.make(t3teamRandomUUID()),
          threadId: claimed.threadId,
          messageId,
          createdAt: yield* nowIso,
        })
        .pipe(
          Effect.as(true),
          Effect.catchCause((cause) =>
            Effect.logWarning("provider usage watcher: pending turn replay failed", {
              threadId: claimed.threadId,
              cause: Cause.pretty(cause),
            }).pipe(Effect.as(false)),
          ),
        );
      const failures = dispatched ? 0 : (deps.state.replayFailures.get(claimed.threadId) ?? 0) + 1;
      if (!dispatched && failures < PROVIDER_USAGE_MAX_REPLAY_ATTEMPTS) {
        deps.state.replayFailures.set(claimed.threadId, failures);
        yield* restoreHold(deps, claimed);
        return false;
      }
      outcome = dispatched ? "resumed" : "gave-up";
    }
  }
  deps.state.replayFailures.delete(claimed.threadId);
  yield* deps.appendActivity(
    claimed.threadId,
    PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.released,
    outcome === "resumed"
      ? "Usage window reset — the turn was sent again automatically"
      : outcome === "gave-up"
        ? "Auto-resume failed — send the message again"
        : "Usage limit cleared — nothing was re-sent",
    {
      providerInstanceId: claimed.providerInstanceId,
      driver: claimed.provider,
      resumed: outcome === "resumed",
      autoResume: claimed.autoResume,
      reason: outcome === "gave-up" ? "auto-resume-failed" : input.reason,
    },
  );
  return true;
});
