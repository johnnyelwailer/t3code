/**
 * Act/release steps of the provider usage-limit watcher (GHE #421, phase 2):
 * pause every session thread of an exhausted driver, release the held threads
 * when the window recovers, and append the matching thread activities. Split
 * out of `t3team-providerUsageWatcher.ts` for the additive LOC budget.
 *
 * @module t3team-providerUsageWatcherActions
 */
import {
  CommandId,
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  type ProviderUsageInstanceHold,
  type ProviderUsageWatcherDeps,
  type ProviderUsageWatcherState,
} from "./t3team-providerUsageWatcherTypes.ts";

/**
 * The watcher is advisory: an internal failure (settings read, repo query,
 * session listing) must never block turn dispatch or crash the loop, so
 * fallible calls degrade to defects that the loop's `catchCause` logs.
 */
export const makeAppendActivity =
  (input: { readonly engine: OrchestrationEngineShape; readonly nowIso: () => string }) =>
  (
    threadId: string,
    kind: (typeof PROVIDER_USAGE_HOLD_ACTIVITY_KINDS)[keyof typeof PROVIDER_USAGE_HOLD_ACTIVITY_KINDS],
    summary: string,
    payload: unknown,
  ): Effect.Effect<void> =>
    input.engine
      .dispatch({
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
          createdAt: input.nowIso(),
        },
        createdAt: input.nowIso(),
      })
      .pipe(Effect.catchCause(() => Effect.void));

/**
 * PAUSE every thread that would run on `driver`: one hold row per
 * session thread of that driver (auto-resume ON by default) plus one
 * `provider.usage-hold.started` activity each.
 */
export const actForDriver = Effect.fn("providerUsageWatcher.actForDriver")(function* (
  deps: ProviderUsageWatcherDeps,
  hold: ProviderUsageInstanceHold,
) {
  let created = 0;
  const threadIds = yield* deps.holds
    .listActiveSessionThreadsForDriver({ provider: ProviderDriverKind.make(hold.driver) })
    .pipe(Effect.orDie);
  for (const row of threadIds) {
    yield* deps.holds
      .upsertActiveHold({
        threadId: ThreadId.make(row.threadId),
        provider: ProviderDriverKind.make(hold.driver),
        providerInstanceId:
          hold.instanceIds[0] !== undefined ? ProviderInstanceId.make(hold.instanceIds[0]!) : null,
        since: hold.since,
        resetsAt: hold.resetsAt,
        autoResume: true,
        pendingTurnMessageId: null,
        releasedAt: null,
        releaseReason: null,
        updatedAt: deps.nowIso(),
      })
      .pipe(Effect.orDie);
    created += 1;
    yield* deps.appendActivity(
      row.threadId,
      PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
      `Provider usage limit reached — ${hold.driver} window exhausted, turns paused`,
      {
        driver: hold.driver,
        since: hold.since,
        resetsAt: hold.resetsAt,
        autoResume: true,
        percentUsed: hold.percentUsed,
      },
    );
  }
  return created;
});

/**
 * RELEASE the held threads of `driver`: mark the rows released and, for
 * the auto-resume-ON threads with a pending turn, re-drive that turn
 * through the existing `thread.turn.resume` command (the same command
 * the #403 re-drive and the Continue button use). A decider rejection
 * (e.g. the pending message is no longer the thread's last user message
 * because the user typed a newer one during the hold) is swallowed: the
 * user's newer message carries its own pending turn and will be replayed.
 */
export const releaseDriver = Effect.fn("providerUsageWatcher.releaseDriver")(function* (
  deps: ProviderUsageWatcherDeps,
  driver: string,
  reason: string,
) {
  deps.state.heldDrivers.delete(driver);
  const rows = (yield* deps.holds.listActive().pipe(Effect.orDie)).filter(
    (row) => row.provider === ProviderDriverKind.make(driver),
  );
  let released = 0;
  for (const row of rows) {
    const resumed = row.autoResume === true && row.pendingTurnMessageId !== null;
    if (resumed) {
      yield* deps.engine
        .dispatch({
          type: "thread.turn.resume",
          commandId: CommandId.make(t3teamRandomUUID()),
          threadId: row.threadId,
          messageId: row.pendingTurnMessageId!,
          createdAt: deps.nowIso(),
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider usage watcher: pending turn replay rejected", {
              threadId: row.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
    }
    yield* deps.holds
      .markReleased({ threadId: row.threadId, reason, now: deps.nowIso() })
      .pipe(Effect.orDie);
    released += 1;
    yield* deps.appendActivity(
      row.threadId,
      PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.released,
      resumed
        ? `Provider window reset — ${driver} work resumed automatically`
        : `Provider window reset — ${driver} work stays paused until you resume it`,
      { driver, resumed, autoResume: row.autoResume },
    );
  }
  return released;
});

/** Rebuild the in-memory held set from the persisted rows (host restart). */
export const rehydrateHeldSet = (
  state: ProviderUsageWatcherState,
  rows: ReadonlyArray<{
    readonly provider: string;
    readonly since: string;
    readonly resetsAt: string | null;
  }>,
): void => {
  for (const row of rows) {
    const existing = state.heldDrivers.get(row.provider);
    state.heldDrivers.set(row.provider, {
      driver: row.provider,
      since: existing?.since ?? row.since,
      resetsAt: existing?.resetsAt ?? row.resetsAt,
      instanceIds: existing?.instanceIds ?? [],
      percentUsed: 100,
    });
  }
};
