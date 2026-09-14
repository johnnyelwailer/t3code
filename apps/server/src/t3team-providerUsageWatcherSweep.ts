/**
 * One sweep pass of the provider usage-limit watcher (GHE #421, phase 2):
 * sample the live-limit windows of providers with an active session, act on
 * newly exhausted windows, warn on approaching ones, and release recovered
 * held drivers. Split out of `t3team-providerUsageWatcher.ts` for the
 * additive LOC budget.
 *
 * @module t3team-providerUsageWatcherSweep
 */
import { ProviderDriverKind } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { sampleProviderInstancesUsage } from "./provider/t3team-providerUsageSampler.ts";
import { actForDriver, releaseDriver } from "./t3team-providerUsageWatcherActions.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  isRecovered,
  type ProviderUsageInstanceHold,
  type ProviderUsageWatcherDeps,
} from "./t3team-providerUsageWatcherTypes.ts";

/**
 * Sample the active sessions' providers once and apply any transition.
 * No-op when a sweep is already in flight (the loop and the manual
 * `sweep()` entry point share this guard).
 */
export const sweepPass = Effect.fn("providerUsageWatcher.sweep")(function* (
  deps: ProviderUsageWatcherDeps,
) {
  if (deps.state.sweepInFlight) return;
  deps.state.sweepInFlight = true;
  try {
    const nowMs = DateTime.nowUnsafe().epochMilliseconds;
    const settings = yield* deps.settingsService.getSettings.pipe(Effect.orDie);

    // Provider instance ids that currently have any session. A listing
    // failure degrades to "no active sessions" (advisory watcher rule).
    const instanceIds = yield* Effect.gen(function* () {
      const sessions = yield* deps.providerService.listSessions().pipe(Effect.orDie);
      const ids = new Set<string>();
      for (const session of sessions) {
        if (session.providerInstanceId !== undefined) ids.add(session.providerInstanceId);
      }
      return ids;
    }).pipe(Effect.catchCause(() => Effect.succeed(new Set<string>())));
    const sample =
      instanceIds.size > 0
        ? yield* Effect.scoped(
            sampleProviderInstancesUsage(settings, {
              requestedInstanceIds: instanceIds,
            }).pipe(Effect.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer))),
          ).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined;
    if (sample !== undefined) deps.state.lastSampledAt = deps.nowIso();

    // ── Act: newly exhausted driver windows ─────────────────────────
    if (sample !== undefined) {
      for (const report of sample.reports) {
        const primary = report.windows.find((window) => window.window === "primary");
        if (primary === undefined || primary.severity !== "critical") continue;
        if (deps.state.heldDrivers.has(report.provider)) {
          // Already held: refresh resetsAt with the live value so the
          // banner shows the correct reset time (the original may be stale).
          const existing = deps.state.heldDrivers.get(report.provider)!;
          if (existing.resetsAt !== primary.resetsAt && primary.resetsAt !== null) {
            deps.state.heldDrivers.set(report.provider, {
              ...existing,
              resetsAt: primary.resetsAt,
              percentUsed: primary.percentUsed,
            });
            // Emit a fresh started activity so the banner updates.
            const threadIds = yield* deps.holds
              .listActiveSessionThreadsForDriver({
                provider: ProviderDriverKind.make(report.provider),
              })
              .pipe(Effect.orDie);
            for (const row of threadIds) {
              yield* deps.appendActivity(
                row.threadId,
                PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
                `Usage limit · ${report.provider} window exhausted`,
                {
                  driver: report.provider,
                  percentUsed: primary.percentUsed,
                  resetsAt: primary.resetsAt,
                },
              );
            }
          }
          continue;
        }
        const hold: ProviderUsageInstanceHold = {
          driver: report.provider,
          since: deps.nowIso(),
          resetsAt: primary.resetsAt,
          instanceIds: [report.providerInstanceId ?? ""],
          percentUsed: primary.percentUsed,
        };
        deps.state.heldDrivers.set(report.provider, hold);
        yield* actForDriver(deps, hold);
      }

      // ── Warn: drivers approaching the limit (≥80%, not yet critical) ─
      for (const report of sample.reports) {
        const primary = report.windows.find((window) => window.window === "primary");
        if (primary === undefined) continue;
        const driver = report.provider;
        if (primary.severity === "warning") {
          if (deps.state.warningDrivers.has(driver) || deps.state.heldDrivers.has(driver)) continue;
          deps.state.warningDrivers.set(driver, {
            percentUsed: primary.percentUsed,
            resetsAt: primary.resetsAt,
          });
          const threadIds = yield* deps.holds
            .listActiveSessionThreadsForDriver({ provider: ProviderDriverKind.make(driver) })
            .pipe(Effect.orDie);
          for (const row of threadIds) {
            yield* deps.appendActivity(
              row.threadId,
              PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warning,
              `Usage ${Math.round(primary.percentUsed)}% · resets in ${primary.resetsAt !== null ? "~" + Math.max(1, Math.round((Date.parse(primary.resetsAt) - nowMs) / 60000)) + "m" : "unknown"}`,
              { driver, percentUsed: primary.percentUsed, resetsAt: primary.resetsAt },
            );
          }
        } else if (primary.severity === "normal") {
          if (deps.state.warningDrivers.has(driver)) {
            deps.state.warningDrivers.delete(driver);
            const threadIds = yield* deps.holds
              .listActiveSessionThreadsForDriver({
                provider: ProviderDriverKind.make(driver),
              })
              .pipe(Effect.orDie);
            for (const row of threadIds) {
              yield* deps.appendActivity(
                row.threadId,
                PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warningCleared,
                `Usage back to normal (${Math.round(primary.percentUsed)}%)`,
                { driver, percentUsed: primary.percentUsed },
              );
            }
          }
        } else if (primary.severity === "critical") {
          // Transitioning to critical: clear the warning (the hold banner takes over).
          if (deps.state.warningDrivers.has(driver)) deps.state.warningDrivers.delete(driver);
        }
      }
    }

    // ── Release: held drivers whose window has recovered ────────────
    for (const driver of Array.from(deps.state.heldDrivers.keys())) {
      const hold = deps.state.heldDrivers.get(driver)!;
      const primary =
        sample?.reports
          .find((report) => report.provider === driver)
          ?.windows.find((window) => window.window === "primary") ?? null;
      const sampleInfo =
        primary !== null ? { percentUsed: primary.percentUsed, severity: primary.severity } : null;
      if (isRecovered(hold, sampleInfo, nowMs)) {
        yield* releaseDriver(deps, driver, "recovered");
      }
    }
  } finally {
    deps.state.sweepInFlight = false;
  }
});
