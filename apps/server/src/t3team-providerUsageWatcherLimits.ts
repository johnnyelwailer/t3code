/**
 * Snapshot step of the provider usage watcher (GHE #421): folds one
 * `ProviderRegistry` snapshot in. Per provider INSTANCE it tracks the
 * session-window severity, tells that instance's session threads when it
 * crosses the warning/critical thresholds, and releases the instance's holds
 * once a fresh snapshot shows no exhausted window. Missing data (`unavailable`,
 * no windows) never warns and never holds.
 *
 * @module t3team-providerUsageWatcherLimits
 */
import {
  ProviderInstanceId,
  exhaustedUsageWindows,
  hasUsageData,
  providerUsageSeverity,
  sessionUsageWindow,
  ThreadId,
  type ProviderUsageSeverity,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { releaseHold } from "./t3team-providerUsageWatcherActions.ts";
import {
  PROVIDER_USAGE_CRITICAL_CLEAR_PERCENT,
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  PROVIDER_USAGE_WARNING_CLEAR_PERCENT,
  type InstanceUsageEntry,
  type ProviderUsageWatcherDeps,
} from "./t3team-providerUsageWatcherTypes.ts";

/**
 * Severity with hysteresis, so a window hovering at a threshold does not
 * flap: a warning clears only below 75%, critical drops only below 95%.
 * Rising always follows the plain 80/100 thresholds.
 */
export const severityWithHysteresis = (
  usedPercent: number,
  previous: ProviderUsageSeverity | null | undefined,
): ProviderUsageSeverity => {
  const plain = providerUsageSeverity(usedPercent);
  if (previous === "critical" && plain !== "critical") {
    if (usedPercent >= PROVIDER_USAGE_CRITICAL_CLEAR_PERCENT) return "critical";
  }
  if ((previous === "critical" || previous === "warning") && plain === "normal") {
    if (usedPercent >= PROVIDER_USAGE_WARNING_CLEAR_PERCENT) return "warning";
  }
  return plain;
};

const instanceUsageEntry = (
  provider: ServerProvider,
  previous: InstanceUsageEntry | undefined,
): InstanceUsageEntry => {
  const limits = provider.usageLimits;
  const session = sessionUsageWindow(limits);
  return {
    driver: provider.driver,
    limits,
    severity:
      session === null ? null : severityWithHysteresis(session.usedPercent, previous?.severity),
    exhausted: exhaustedUsageWindows(limits).length > 0,
  };
};

const notifyInstanceThreads = Effect.fn("providerUsageWatcher.notifyInstanceThreads")(function* (
  deps: ProviderUsageWatcherDeps,
  instanceId: string,
  entry: InstanceUsageEntry,
) {
  const threads = yield* deps.holds
    .listActiveSessionThreadsForInstance({
      providerInstanceId: ProviderInstanceId.make(instanceId),
    })
    .pipe(Effect.orDie);
  const session = sessionUsageWindow(entry.limits);
  const percentUsed = session?.usedPercent ?? 0;
  const payload = {
    providerInstanceId: instanceId,
    driver: entry.driver,
    percentUsed,
    resetsAt: session?.resetsAt ?? null,
    severity: entry.severity,
  };
  const cleared = entry.severity === "normal" || entry.severity === null;
  for (const { threadId } of threads) {
    yield* cleared
      ? deps.appendActivity(
          threadId,
          PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warningCleared,
          "Usage back below the warning level",
          payload,
        )
      : deps.appendActivity(
          threadId,
          PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warning,
          entry.severity === "critical"
            ? `Usage limit reached (${Math.round(percentUsed)}%) — the provider may reject turns`
            : `Usage ${Math.round(percentUsed)}% of the session window`,
          payload,
        );
  }
});

/**
 * Release an instance's holds when the snapshot is fresher than the hold and
 * shows no exhausted window. A hold with a known reset moment also waits for
 * the instance to have been SEEN exhausted and then recover (edge), so a lag
 * between the failure and the provider's own window update cannot replay a
 * turn straight back into the wall.
 */
const releaseRecovered = Effect.fn("providerUsageWatcher.releaseRecovered")(function* (
  deps: ProviderUsageWatcherDeps,
  instanceId: string,
  entry: InstanceUsageEntry,
  recoveredEdge: boolean,
) {
  if (!hasUsageData(entry.limits) || entry.exhausted) return;
  // Hot path (Codex republishes on every token tick): decide from the
  // in-memory mirror; only a hold that is actually due touches the DB.
  const checkedAtMs = Date.parse(entry.limits.checkedAt);
  const due = [...deps.state.heldThreads].filter(
    ([, held]) =>
      held.instanceId === instanceId &&
      checkedAtMs > Date.parse(held.since) &&
      (held.resetsAt === null || recoveredEdge),
  );
  for (const [threadId] of due) {
    yield* releaseHold(
      deps,
      { threadId: ThreadId.make(threadId) },
      {
        reason: "recovered",
        replay: true,
      },
    );
  }
});

export const applyProviders = Effect.fn("providerUsageWatcher.applyProviders")(function* (
  deps: ProviderUsageWatcherDeps,
  providers: ReadonlyArray<ServerProvider>,
) {
  for (const provider of providers) {
    const instanceId = provider.instanceId;
    const previous = deps.state.instances.get(instanceId);
    const entry = instanceUsageEntry(provider, previous);
    // Missing data is not news: keep the last real reading and what the
    // threads were last told, and never release or warn on it.
    if (!hasUsageData(entry.limits)) continue;
    deps.state.instances.set(instanceId, entry);
    if (entry.severity !== null && entry.severity !== (previous?.severity ?? "normal")) {
      yield* notifyInstanceThreads(deps, instanceId, entry);
    }
    yield* releaseRecovered(deps, instanceId, entry, previous?.exhausted === true);
  }
});
