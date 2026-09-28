/**
 * Release steps of the provider usage watcher (GHE #421): claim a hold's
 * release, replay its pending turn once when that is still correct, and
 * append the matching thread activities.
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
  PROVIDER_USAGE_RESUME_GRACE_MS,
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

/** Deadline for a hold: its reset moment plus grace; null when no reset moment is known. */
const holdDeadlineMs = (hold: Pick<HoldRow, "resetsAt">): number | null => {
  if (hold.resetsAt === null) return null;
  const at = Date.parse(hold.resetsAt);
  return Number.isFinite(at) ? at + PROVIDER_USAGE_RESUME_GRACE_MS : null;
};

/**
 * RELEASE one hold. The conditional `markReleased` is the claim: only the
 * caller that flips the row goes on, so a hold is replayed at most once even
 * when a deadline tick and a recovery snapshot race. `replay: false` clears
 * the hold without re-driving (the thread was answered some other way).
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
  let resumed = false;
  const messageId = claimed.pendingTurnMessageId;
  if (input.replay && claimed.autoResume && messageId !== null) {
    const thread = Option.getOrUndefined(
      yield* deps.query
        .getThreadDetailById(claimed.threadId)
        .pipe(Effect.orElseSucceed(() => Option.none())),
    );
    if (thread !== undefined && isReplayable(thread, messageId)) {
      resumed = yield* deps.engine
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
            Effect.logWarning("provider usage watcher: pending turn replay rejected", {
              threadId: claimed.threadId,
              cause: Cause.pretty(cause),
            }).pipe(Effect.as(false)),
          ),
        );
    }
  }
  yield* deps.appendActivity(
    claimed.threadId,
    PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.released,
    resumed
      ? "Usage window reset — the turn was sent again automatically"
      : "Usage limit cleared — nothing was re-sent",
    {
      providerInstanceId: claimed.providerInstanceId,
      driver: claimed.provider,
      resumed,
      autoResume: claimed.autoResume,
      reason: input.reason,
    },
  );
  return true;
});

/** Release (with replay) every active hold whose deadline has passed. */
export const releaseDue = Effect.fn("providerUsageWatcher.releaseDue")(function* (
  deps: ProviderUsageWatcherDeps,
) {
  const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
  for (const row of yield* deps.holds.listActive().pipe(Effect.orDie)) {
    const deadline = holdDeadlineMs(row);
    if (deadline !== null && nowMs >= deadline) {
      yield* releaseHold(deps, row, { reason: "reset", replay: true });
    }
  }
});
