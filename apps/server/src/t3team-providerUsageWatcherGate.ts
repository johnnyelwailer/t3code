/**
 * Turn-start gate of the provider usage-limit watcher (GHE #421, phase 2):
 * `checkThreadHeld` tells the reactor whether a thread's provider window is
 * held (defer the turn), and `recordDeferredTurn` stores the deferred turn
 * so auto-resume can replay it. Split out of `t3team-providerUsageWatcher.ts`
 * for the additive LOC budget.
 *
 * @module t3team-providerUsageWatcherGate
 */
import { MessageId, ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  driverForThread,
  type ProviderUsageWatcherDeps,
  type ThreadHoldInfo,
} from "./t3team-providerUsageWatcherTypes.ts";

/** Is the driver window for this thread's provider currently held? */
export const checkThreadHeld: (
  deps: ProviderUsageWatcherDeps,
  input: {
    readonly threadId: string;
    readonly providerInstanceId: string | null;
    readonly sessionProviderName: string | null;
  },
) => Effect.Effect<Option.Option<ThreadHoldInfo>> = Effect.fn(
  "providerUsageWatcher.checkThreadHeld",
)(function* (
  deps: ProviderUsageWatcherDeps,
  input: {
    readonly threadId: string;
    readonly providerInstanceId: string | null;
    readonly sessionProviderName: string | null;
  },
) {
  const settings = yield* deps.settingsService.getSettings.pipe(Effect.orDie);
  const driver = driverForThread(settings, input);
  if (driver !== null && deps.state.heldDrivers.has(driver)) {
    const hold = deps.state.heldDrivers.get(driver)!;
    const row = yield* deps.holds
      .getByThreadId({ threadId: ThreadId.make(input.threadId) })
      .pipe(Effect.orDie, Effect.map(Option.getOrUndefined));
    return Option.some({
      driver,
      since: hold.since,
      resetsAt: hold.resetsAt,
      autoResume: row?.autoResume ?? true,
      source: "watcher",
    });
  }
  // Persisted row without an in-memory entry (settings entry missing for
  // the instance, or a driver with no live sampler): the row still gates.
  const row = yield* deps.holds
    .getByThreadId({ threadId: ThreadId.make(input.threadId) })
    .pipe(Effect.orDie, Effect.map(Option.getOrUndefined));
  if (row !== undefined && row.releasedAt === null) {
    return Option.some({
      driver: row.provider,
      since: row.since,
      resetsAt: row.resetsAt,
      autoResume: row.autoResume,
      source: "persisted",
    });
  }
  return Option.none();
});

/**
 * Record a turn start the reactor deferred because the thread's provider
 * window is held. Upserts the thread's hold row (creating it when the
 * watcher's act step has not reached the thread yet, e.g. a thread without
 * a session row) and stores the message as the pending turn.
 */
export const recordDeferredTurn = Effect.fn("providerUsageWatcher.recordDeferredTurn")(function* (
  deps: ProviderUsageWatcherDeps,
  input: {
    readonly threadId: string;
    readonly messageId: string;
    readonly driver: string;
    readonly providerInstanceId: string | null;
    readonly resetsAt: string | null;
    readonly now: string;
  },
) {
  const existing = yield* deps.holds
    .getByThreadId({ threadId: ThreadId.make(input.threadId) })
    .pipe(Effect.orDie, Effect.map(Option.getOrUndefined));
  if (existing !== undefined && existing.releasedAt === null) {
    yield* deps.holds
      .setPendingTurn({
        threadId: ThreadId.make(input.threadId),
        messageId: MessageId.make(input.messageId),
        now: input.now,
      })
      .pipe(Effect.orDie);
  } else {
    yield* deps.holds
      .upsertActiveHold({
        threadId: ThreadId.make(input.threadId),
        provider: ProviderDriverKind.make(input.driver),
        providerInstanceId:
          input.providerInstanceId === null
            ? null
            : ProviderInstanceId.make(input.providerInstanceId),
        since: input.now,
        resetsAt: input.resetsAt,
        autoResume: true,
        pendingTurnMessageId: MessageId.make(input.messageId),
        releasedAt: null,
        releaseReason: null,
        updatedAt: input.now,
      })
      .pipe(Effect.orDie);
  }
  yield* deps.appendActivity(
    input.threadId,
    PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
    `Usage limit · ${input.driver} window exhausted`,
    {
      messageId: input.messageId,
      resetsAt: input.resetsAt,
      driver: input.driver,
      percentUsed: 100,
    },
  );
});
