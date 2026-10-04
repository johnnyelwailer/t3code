/**
 * Deadline step of the provider usage watcher (GHE #421): every check
 * releases (and replays) the holds whose reset moment plus grace has passed —
 * unless the instance's own snapshot says the wall is still up.
 *
 *  - The snapshot moved the reset later → re-arm the hold to it.
 *  - The snapshot was taken AFTER the hold's reset moment and still shows an
 *    exhausted window → keep waiting (a re-send would only hit the wall).
 *  - No snapshot, missing data, or one taken before the reset moment → the
 *    deadline wins, as the provider's own schedule is the best evidence.
 *
 * @module t3team-providerUsageWatcherDeadline
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { ProviderUsageHold as HoldRow } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import { nowIso, releaseHold } from "./t3team-providerUsageWatcherActions.ts";
import { holdResetsAt } from "./t3team-providerUsageWatcherFailures.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  PROVIDER_USAGE_RESUME_GRACE_MS,
  type ProviderUsageWatcherDeps,
} from "./t3team-providerUsageWatcherTypes.ts";

/** Deadline for a hold: its reset moment plus grace; null when no reset moment is known. */
const holdDeadlineMs = (hold: Pick<HoldRow, "resetsAt">): number | null => {
  if (hold.resetsAt === null) return null;
  const at = Date.parse(hold.resetsAt);
  return Number.isFinite(at) ? at + PROVIDER_USAGE_RESUME_GRACE_MS : null;
};

const rearmHold = Effect.fn("providerUsageWatcher.rearmHold")(function* (
  deps: ProviderUsageWatcherDeps,
  row: HoldRow,
  resetsAt: string,
) {
  yield* deps.holds
    .upsertActiveHold({ ...row, resetsAt, updatedAt: yield* nowIso })
    .pipe(Effect.orDie);
  deps.state.heldThreads.set(row.threadId, {
    instanceId: row.providerInstanceId,
    since: row.since,
    resetsAt,
  });
  yield* deps.appendActivity(
    row.threadId,
    PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
    "Usage window still exhausted — the re-send moved to the new reset time",
    {
      providerInstanceId: row.providerInstanceId,
      driver: row.provider,
      messageId: row.pendingTurnMessageId,
      resetsAt,
      autoResume: row.autoResume,
    },
  );
});

/** Release (with replay), re-arm, or keep waiting — for every hold past its deadline. */
export const releaseDue = Effect.fn("providerUsageWatcher.releaseDue")(function* (
  deps: ProviderUsageWatcherDeps,
) {
  const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
  for (const row of yield* deps.holds.listActive().pipe(Effect.orDie)) {
    const deadline = holdDeadlineMs(row);
    if (deadline === null || nowMs < deadline) continue;
    const entry =
      row.providerInstanceId === null
        ? undefined
        : deps.state.instances.get(row.providerInstanceId);
    if (entry?.exhausted === true && entry.limits !== undefined) {
      const next = holdResetsAt(entry.limits, nowMs);
      if (next !== null && Date.parse(next) > Date.parse(row.resetsAt!)) {
        yield* rearmHold(deps, row, next);
        continue;
      }
      if (Date.parse(entry.limits.checkedAt) >= Date.parse(row.resetsAt!)) continue;
    }
    yield* releaseHold(deps, row, { reason: "reset", replay: true });
  }
});
