/**
 * Turn-outcome step of the provider usage watcher (GHE #421). Sends are
 * never gated: the provider decides. This step only reacts to what the
 * provider did with a turn:
 *
 *  - a turn FAILED with the adapter's structured `failureKind: "usage_limit"`,
 *    or failed while its instance's last snapshot shows an exhausted window
 *    → record the turn's user message as pending on a per-thread hold keyed
 *    by the INSTANCE, with the exhausted window's reset moment;
 *  - a turn COMPLETED on a held thread → the thread was answered some other
 *    way (the user re-sent), so the hold is cleared without a replay.
 *
 * @module t3team-providerUsageWatcherFailures
 */
import {
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  exhaustedUsageWindows,
  sessionUsageWindow,
  ThreadId,
  type ProviderRuntimeEvent,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { nowIso, releaseHold } from "./t3team-providerUsageWatcherActions.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  type ProviderUsageWatcherDeps,
} from "./t3team-providerUsageWatcherTypes.ts";

/**
 * When the wall lifts: the latest reset among the exhausted windows (a
 * weekly wall outlasts the session one), else the session window's reset.
 * A reset moment already in the past is stale data, not a schedule — the
 * hold then waits for a fresh below-critical snapshot instead.
 */
const holdResetsAt = (
  limits: ServerProviderUsageLimits | undefined,
  nowMs: number,
): string | null => {
  const exhausted = exhaustedUsageWindows(limits).flatMap((window) =>
    window.resetsAt === undefined ? [] : [window.resetsAt],
  );
  const candidate =
    exhausted.length > 0
      ? exhausted.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest))
      : sessionUsageWindow(limits)?.resetsAt;
  if (candidate === undefined) return null;
  return Date.parse(candidate) > nowMs ? candidate : null;
};

/** Record one thread's failed turn as a pending replay on its instance's hold. */
export const recordHold = Effect.fn("providerUsageWatcher.recordHold")(function* (
  deps: ProviderUsageWatcherDeps,
  input: {
    readonly threadId: string;
    readonly messageId: string;
    readonly providerInstanceId: string;
    readonly driver: string;
    readonly resetsAt: string | null;
  },
) {
  const now = yield* nowIso;
  yield* deps.holds
    .upsertActiveHold({
      threadId: ThreadId.make(input.threadId),
      provider: ProviderDriverKind.make(input.driver),
      providerInstanceId: ProviderInstanceId.make(input.providerInstanceId),
      since: now,
      resetsAt: input.resetsAt,
      autoResume: true,
      pendingTurnMessageId: MessageId.make(input.messageId),
      releasedAt: null,
      releaseReason: null,
      updatedAt: now,
    })
    .pipe(Effect.orDie);
  deps.state.heldThreads.add(input.threadId);
  const row = Option.getOrUndefined(
    yield* deps.holds.getByThreadId({ threadId: ThreadId.make(input.threadId) }).pipe(Effect.orDie),
  );
  yield* deps.appendActivity(
    input.threadId,
    PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
    "Usage limit reached — this turn will be sent again when the window resets",
    {
      providerInstanceId: input.providerInstanceId,
      driver: input.driver,
      messageId: input.messageId,
      resetsAt: input.resetsAt,
      autoResume: row?.autoResume ?? true,
    },
  );
});

export const onRuntimeEvent = Effect.fn("providerUsageWatcher.onRuntimeEvent")(function* (
  deps: ProviderUsageWatcherDeps,
  event: ProviderRuntimeEvent,
) {
  if (event.type !== "turn.completed") return;
  const threadId = event.threadId;
  if (event.payload.state === "completed") {
    if (deps.state.heldThreads.has(threadId)) {
      yield* releaseHold(deps, { threadId }, { reason: "answered", replay: false });
    }
    return;
  }
  if (event.payload.state !== "failed") return;
  const thread = Option.getOrUndefined(
    yield* deps.query.getThreadDetailById(threadId).pipe(Effect.orElseSucceed(() => Option.none())),
  );
  const instanceId = event.providerInstanceId ?? thread?.session?.providerInstanceId ?? null;
  if (thread === undefined || instanceId === null) return;
  const entry = deps.state.instances.get(instanceId);
  const limited = event.payload.failureKind === "usage_limit" || entry?.exhausted === true;
  if (!limited) return;
  const lastUser = thread.messages.findLast((message) => message.role === "user");
  if (lastUser === undefined) return;
  const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
  yield* recordHold(deps, {
    threadId,
    messageId: lastUser.id,
    providerInstanceId: instanceId,
    driver: entry?.driver ?? event.provider,
    resetsAt: holdResetsAt(entry?.limits, nowMs),
  });
});
