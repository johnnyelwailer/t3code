/**
 * Provider usage-limit watcher (GHE #421, phase 2 — the watch + act layer).
 *
 * Phase 1 (the `t3team.runtime.provider_usage` tool) samples the live rolling
 * plan limits of a provider on demand. This module adds the WATCH side:
 *
 *  1. **Sweep** — every `T3TEAM_PROVIDER_USAGE_SWEEP_MS` (default 60 s) the
 *     watcher samples the live-limit windows of the providers that have an
 *     ACTIVE provider session right now (the #421 decision "session-scoped
 *     only — sample a provider only when it has an active session; no
 *     resident daemon"). With no active session, a sweep is a Set lookup and
 *     no network call.
 *  2. **Act** — when a driver's primary window turns `critical` against the
 *     host thresholds (window exhausted, e.g. Claude's 5-hour window at
 *     0% remaining), the watcher pauses every thread that would run on that
 *     driver: one hold row per affected session thread (auto-resume ON by
 *     default) plus one `provider.usage-hold.started` activity each. From
 *     then on the reactor's turn-start gate defers any turn start on a held
 *     thread instead of burning the provider's quota-error path — including
 *     the #403 bounded re-drive loop, which would otherwise fail the run in
 *     ~3 minutes while the window is closed for hours.
 *  3. **Auto-resume** — the hold rows carry the provider-reported `resetsAt`
 *     moment. The watcher re-checks on every sweep; when the window has
 *     recovered (a live sample reads below critical, or the deadline passed
 *     and no sample is available — the session-scoped rule means an idle
 *     machine may have nothing to sample) it releases the holds: threads
 *     with auto-resume ON get their pending turn re-driven through the
 *     existing `thread.turn.resume` command; threads with the toggle OFF are
 *     released without a replay so the user resumes deliberately. A host
 *     restart rehydrates the held set from the hold rows and an overdue
 *     deadline catches up immediately (the same downtime semantics as the
 *     workflow scheduler).
 *
 * Dev hooks (`forceExhaust` / `forceRecover`, gated behind
 * `T3TEAM_PROVIDER_USAGE_DEV_FORCE=1`) run the exact act/release paths with
 * a synthetic sample so the feature can be verified end-to-end without
 * burning a real subscription window.
 *
 * @module t3team-providerUsageWatcher
 */
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProviderUsageHoldRepository,
  type ProviderUsageHold,
} from "./persistence/Services/ProviderUsageHolds.ts";
import { ProviderUsageHoldRepositoryLive } from "./persistence/Layers/ProviderUsageHolds.ts";
import {
  PROVIDER_USAGE_CLAUDE_DRIVER,
  PROVIDER_USAGE_CODEX_DRIVER,
  sampleProviderInstancesUsage,
} from "./provider/t3team-providerUsageSampler.ts";
import {
  CommandId,
  EventId,
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ServerSettings,
} from "@t3tools/contracts";
import * as ProviderService from "./provider/Services/ProviderService.ts";
import * as ServerSettingsModule from "./serverSettings.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { FetchHttpClient } from "effect/unstable/http";

/** Sweep cadence while the watcher is active. */
export const PROVIDER_USAGE_SWEEP_INTERVAL_MS = 60_000;

/** Grace after the provider-reported reset moment before the time-based recovery fires. */
export const PROVIDER_USAGE_RECOVER_GRACE_MS = 90_000;

const isUsageDriver = (driver: string): boolean =>
  driver === PROVIDER_USAGE_CLAUDE_DRIVER || driver === PROVIDER_USAGE_CODEX_DRIVER;

/** Activity kinds the web banner derives from (open activity vocabulary). */
export const PROVIDER_USAGE_HOLD_ACTIVITY_KINDS = {
  started: "provider.usage-hold.started",
  deferred: "provider.usage-hold.deferred",
  released: "provider.usage-hold.released",
  autoResumeSet: "provider.usage-hold.auto-resume-set",
  warning: "provider.usage.warning",
  warningCleared: "provider.usage.warning-cleared",
} as const;

export type ProviderUsageHoldActivityKind =
  (typeof PROVIDER_USAGE_HOLD_ACTIVITY_KINDS)[keyof typeof PROVIDER_USAGE_HOLD_ACTIVITY_KINDS];

/** One held driver window, as the in-memory act/release state sees it. */
export interface ProviderUsageInstanceHold {
  readonly driver: string;
  readonly since: string;
  readonly resetsAt: string | null;
  /** Instance ids whose session triggered the hold (empty after rehydrate). */
  readonly instanceIds: ReadonlyArray<string>;
  readonly percentUsed: number;
}

/** What the turn-start gate needs to defer (or admit) one turn. */
export interface ThreadHoldInfo {
  readonly driver: string;
  readonly since: string;
  readonly resetsAt: string | null;
  readonly autoResume: boolean;
  readonly source: "watcher" | "persisted";
}

export interface ProviderUsageWatcherDevState {
  readonly held: ReadonlyArray<ProviderUsageInstanceHold>;
  readonly holds: ReadonlyArray<ProviderUsageHold>;
  readonly lastSampledAt: string | null;
}

/** Dev-hook failure (dev-force hooks are off, or the driver is unknown). */
export class ProviderUsageDevError extends Data.TaggedError("ProviderUsageDevError")<{
  readonly message: string;
}> {}

export interface ProviderUsageWatcherShape {
  /** Sample the active sessions' providers once and apply any transition. */
  readonly sweep: () => Effect.Effect<void>;
  /** Is the driver window for this thread's provider currently held? */
  readonly checkThreadHeld: (input: {
    readonly threadId: string;
    readonly providerInstanceId: string | null;
    readonly sessionProviderName: string | null;
  }) => Effect.Effect<Option.Option<ThreadHoldInfo>>;
  /**
   * Record a turn start the reactor deferred because the thread's provider
   * window is held. Upserts the thread's hold row (creating it when the
   * watcher's act step has not reached the thread yet, e.g. a thread without
   * a session row) and stores the message as the pending turn.
   */
  readonly recordDeferredTurn: (input: {
    readonly threadId: string;
    readonly messageId: string;
    readonly driver: string;
    readonly providerInstanceId: string | null;
    readonly resetsAt: string | null;
    readonly now: string;
  }) => Effect.Effect<void>;
  /** Dev hook: force-exhaust a driver window without sampling. */
  readonly forceExhaust: (input: {
    readonly provider?: string;
    readonly providerInstanceId?: string;
    readonly resetsInMs?: number;
    /** Target one specific thread instead of the driver's session threads (demo). */
    readonly threadId?: string;
  }) => Effect.Effect<
    { readonly holdsCreated: number; readonly resetsAt: string },
    ProviderUsageDevError
  >;
  /** Dev hook: force-recover every held driver (runs the real release path). */
  readonly forceRecover: () => Effect.Effect<{ readonly released: number }, ProviderUsageDevError>;
  /** Dev hook: current held state + persisted rows. */
  readonly getDevState: () => Effect.Effect<ProviderUsageWatcherDevState>;
}

export class ProviderUsageWatcher extends Context.Service<
  ProviderUsageWatcher,
  ProviderUsageWatcherShape
>()("t3/t3team-providerUsageWatcher/ProviderUsageWatcher") {}

/**
 * Resolve the driver kind a turn would run on: the thread's model-selection
 * instance first (what the NEXT turn will use), the session's provider name
 * as fallback (what the LAST turn used).
 */
const driverForThread = (
  settings: ServerSettings,
  input: {
    readonly providerInstanceId: string | null;
    readonly sessionProviderName: string | null;
  },
): string | null => {
  const byInstance = input.providerInstanceId
    ? (settings.providerInstances[ProviderInstanceId.make(input.providerInstanceId)]?.driver ??
      null)
    : null;
  if (byInstance !== null) return byInstance;
  return input.sessionProviderName ?? null;
};

const makeProviderUsageWatcher = (input: {
  readonly sweepIntervalMs: number;
  readonly devForceEnabled: boolean;
}) =>
  Effect.gen(function* () {
    const settingsService = yield* ServerSettingsModule.ServerSettingsService;
    const providerService = yield* ProviderService.ProviderService;
    const engine = yield* OrchestrationEngineService;
    const holds = yield* ProviderUsageHoldRepository;
    const devForceEnabled = input.devForceEnabled;

    /** In-memory held set, keyed by driver kind. Rehydrated from the rows. */
    const heldDrivers = new Map<string, ProviderUsageInstanceHold>();
    /** In-memory warning set, keyed by driver kind. Not persisted. */
    const warningDrivers = new Map<
      string,
      { readonly percentUsed: number; readonly resetsAt: string | null }
    >();
    let lastSampledAt: string | null = null;
    let sweepInFlight = false;

    /**
     * The watcher is advisory: an internal failure (settings read, repo query,
     * session listing) must never block turn dispatch or crash the loop, so
     * fallible calls degrade to defects that the loop's `catchCause` logs.
     */
    const nowIso = (): string => DateTime.formatIso(DateTime.nowUnsafe());

    const appendActivity = (
      threadId: string,
      kind: ProviderUsageHoldActivityKind,
      summary: string,
      payload: unknown,
    ) =>
      engine
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
            createdAt: nowIso(),
          },
          createdAt: nowIso(),
        })
        .pipe(Effect.catchCause(() => Effect.void));

    /** Provider instance ids that currently have any session. */
    const activeSessionInstanceIds = Effect.gen(function* () {
      const sessions = yield* providerService.listSessions().pipe(Effect.orDie);
      const ids = new Set<string>();
      for (const session of sessions) {
        if (session.providerInstanceId !== undefined) ids.add(session.providerInstanceId);
      }
      return ids;
    });

    /**
     * PAUSE every thread that would run on `driver`: one hold row per
     * session thread of that driver (auto-resume ON by default) plus one
     * `provider.usage-hold.started` activity each.
     */
    const actForDriver = Effect.fn("providerUsageWatcher.actForDriver")(function* (
      hold: ProviderUsageInstanceHold,
    ) {
      let created = 0;
      const threadIds = yield* holds
        .listActiveSessionThreadsForDriver({ provider: ProviderDriverKind.make(hold.driver) })
        .pipe(Effect.orDie);
      for (const row of threadIds) {
        yield* holds
          .upsertActiveHold({
            threadId: ThreadId.make(row.threadId),
            provider: ProviderDriverKind.make(hold.driver),
            providerInstanceId:
              hold.instanceIds[0] !== undefined
                ? ProviderInstanceId.make(hold.instanceIds[0]!)
                : null,
            since: hold.since,
            resetsAt: hold.resetsAt,
            autoResume: true,
            pendingTurnMessageId: null,
            releasedAt: null,
            releaseReason: null,
            updatedAt: nowIso(),
          })
          .pipe(Effect.orDie);
        created += 1;
        yield* appendActivity(
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
    const releaseDriver = Effect.fn("providerUsageWatcher.releaseDriver")(function* (
      driver: string,
      reason: string,
    ) {
      heldDrivers.delete(driver);
      const rows = (yield* holds.listActive().pipe(Effect.orDie)).filter(
        (row) => row.provider === ProviderDriverKind.make(driver),
      );
      let released = 0;
      for (const row of rows) {
        const resumed = row.autoResume === true && row.pendingTurnMessageId !== null;
        if (resumed) {
          yield* engine
            .dispatch({
              type: "thread.turn.resume",
              commandId: CommandId.make(t3teamRandomUUID()),
              threadId: row.threadId,
              messageId: row.pendingTurnMessageId!,
              createdAt: nowIso(),
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
        yield* holds
          .markReleased({ threadId: row.threadId, reason, now: nowIso() })
          .pipe(Effect.orDie);
        released += 1;
        yield* appendActivity(
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

    /**
     * Recovery rule for one held driver:
     *  - a fresh sample below critical wins (early recovery / plan change);
     *  - otherwise, when the provider reported a reset moment and it has
     *    passed (plus grace), recover on TIME — the session-scoped sampling
     *    rule may have nothing to sample on an idle machine, and the rolling
     *    window does reset on schedule;
     *  - with no reported reset moment, only a below-critical sample recovers.
     */
    const isRecovered = (
      hold: ProviderUsageInstanceHold,
      sample: { readonly percentUsed: number; readonly severity: string } | null,
      nowMs: number,
    ): boolean => {
      if (sample !== null && sample.severity !== "critical") return true;
      if (hold.resetsAt !== null) {
        const deadlineMs = Date.parse(hold.resetsAt) + PROVIDER_USAGE_RECOVER_GRACE_MS;
        if (!Number.isNaN(deadlineMs) && nowMs >= deadlineMs) return true;
      }
      return false;
    };

    const sweep: ProviderUsageWatcherShape["sweep"] = Effect.fn("providerUsageWatcher.sweep")(
      function* () {
        if (sweepInFlight) return;
        sweepInFlight = true;
        try {
          const nowMs = DateTime.nowUnsafe().epochMilliseconds;
          const settings = yield* settingsService.getSettings.pipe(Effect.orDie);

          const instanceIds = yield* activeSessionInstanceIds;
          const sample =
            instanceIds.size > 0
              ? yield* Effect.scoped(
                  sampleProviderInstancesUsage(settings, {
                    requestedInstanceIds: instanceIds,
                  }).pipe(Effect.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer))),
                ).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
              : undefined;
          if (sample !== undefined) lastSampledAt = nowIso();

          // ── Act: newly exhausted driver windows ─────────────────────────
          if (sample !== undefined) {
            for (const report of sample.reports) {
              const primary = report.windows.find((window) => window.window === "primary");
              if (primary === undefined || primary.severity !== "critical") continue;
              if (heldDrivers.has(report.provider)) continue;
              const hold: ProviderUsageInstanceHold = {
                driver: report.provider,
                since: nowIso(),
                resetsAt: primary.resetsAt,
                instanceIds: [report.providerInstanceId ?? ""],
                percentUsed: primary.percentUsed,
              };
              heldDrivers.set(report.provider, hold);
              yield* actForDriver(hold);
            }

            // ── Warn: drivers approaching the limit (≥80%, not yet critical) ─
            for (const report of sample.reports) {
              const primary = report.windows.find((window) => window.window === "primary");
              if (primary === undefined) continue;
              const driver = report.provider;
              if (primary.severity === "warning") {
                if (warningDrivers.has(driver) || heldDrivers.has(driver)) continue;
                warningDrivers.set(driver, {
                  percentUsed: primary.percentUsed,
                  resetsAt: primary.resetsAt,
                });
                const threadIds = yield* holds
                  .listActiveSessionThreadsForDriver({ provider: ProviderDriverKind.make(driver) })
                  .pipe(Effect.orDie);
                for (const row of threadIds) {
                  yield* appendActivity(
                    row.threadId,
                    PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warning,
                    `Usage ${Math.round(primary.percentUsed)}% · resets in ${primary.resetsAt !== null ? "~" + Math.max(1, Math.round((Date.parse(primary.resetsAt) - nowMs) / 60000)) + "m" : "unknown"}`,
                    { driver, percentUsed: primary.percentUsed, resetsAt: primary.resetsAt },
                  );
                }
              } else if (primary.severity === "normal") {
                if (warningDrivers.has(driver)) {
                  warningDrivers.delete(driver);
                  const threadIds = yield* holds
                    .listActiveSessionThreadsForDriver({
                      provider: ProviderDriverKind.make(driver),
                    })
                    .pipe(Effect.orDie);
                  for (const row of threadIds) {
                    yield* appendActivity(
                      row.threadId,
                      PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warningCleared,
                      `Usage back to normal (${Math.round(primary.percentUsed)}%)`,
                      { driver, percentUsed: primary.percentUsed },
                    );
                  }
                }
              } else if (primary.severity === "critical") {
                // Transitioning to critical: clear the warning (the hold banner takes over).
                if (warningDrivers.has(driver)) warningDrivers.delete(driver);
              }
            }
          }

          // ── Release: held drivers whose window has recovered ────────────
          for (const driver of Array.from(heldDrivers.keys())) {
            const hold = heldDrivers.get(driver)!;
            const primary =
              sample?.reports
                .find((report) => report.provider === driver)
                ?.windows.find((window) => window.window === "primary") ?? null;
            const sampleInfo =
              primary !== null
                ? { percentUsed: primary.percentUsed, severity: primary.severity }
                : null;
            if (isRecovered(hold, sampleInfo, nowMs)) {
              yield* releaseDriver(driver, "recovered");
            }
          }
        } finally {
          sweepInFlight = false;
        }
      },
    );

    const checkThreadHeld: ProviderUsageWatcherShape["checkThreadHeld"] = Effect.fn(
      "providerUsageWatcher.checkThreadHeld",
    )(function* (input) {
      const settings = yield* settingsService.getSettings.pipe(Effect.orDie);
      const driver = driverForThread(settings, input);
      if (driver !== null && heldDrivers.has(driver)) {
        const hold = heldDrivers.get(driver)!;
        const row = yield* holds
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
      const row = yield* holds
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

    const recordDeferredTurn: ProviderUsageWatcherShape["recordDeferredTurn"] = Effect.fn(
      "providerUsageWatcher.recordDeferredTurn",
    )(function* (input) {
      const existing = yield* holds
        .getByThreadId({ threadId: ThreadId.make(input.threadId) })
        .pipe(Effect.orDie, Effect.map(Option.getOrUndefined));
      if (existing !== undefined && existing.releasedAt === null) {
        yield* holds
          .setPendingTurn({
            threadId: ThreadId.make(input.threadId),
            messageId: MessageId.make(input.messageId),
            now: input.now,
          })
          .pipe(Effect.orDie);
      } else {
        yield* holds
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
      yield* appendActivity(
        input.threadId,
        PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.deferred,
        `Turn deferred — ${input.driver} usage window exhausted`,
        { messageId: input.messageId, resetsAt: input.resetsAt },
      );
    });

    const forceExhaust: ProviderUsageWatcherShape["forceExhaust"] = Effect.fn(
      "providerUsageWatcher.forceExhaust",
    )(function* (devInput) {
      if (!devForceEnabled) {
        return yield* Effect.fail(
          new ProviderUsageDevError({
            message:
              "Dev force hooks are disabled (set T3TEAM_PROVIDER_USAGE_DEV_FORCE=1 to enable).",
          }),
        );
      }
      const settings = yield* settingsService.getSettings.pipe(Effect.orDie);
      const driver =
        devInput.provider !== undefined && isUsageDriver(devInput.provider)
          ? devInput.provider
          : devInput.providerInstanceId !== undefined
            ? settings.providerInstances[ProviderInstanceId.make(devInput.providerInstanceId)]
                ?.driver
            : undefined;
      if (driver === undefined || driver === null) {
        return yield* Effect.fail(
          new ProviderUsageDevError({
            message:
              "forceExhaust needs a known usage driver (provider) or a configured provider instance (providerInstanceId).",
          }),
        );
      }
      const resetsInMs = devInput.resetsInMs ?? 5 * 60_000;
      const since = nowIso();
      const resetsAt = DateTime.formatIso(
        DateTime.addDuration(DateTime.nowUnsafe(), Duration.millis(resetsInMs)),
      );
      const hold: ProviderUsageInstanceHold = {
        driver,
        since,
        resetsAt,
        instanceIds: devInput.providerInstanceId !== undefined ? [devInput.providerInstanceId] : [],
        percentUsed: 100,
      };
      heldDrivers.set(driver, hold);
      let holdsCreated = 0;
      if (devInput.threadId !== undefined) {
        yield* holds
          .upsertActiveHold({
            threadId: ThreadId.make(devInput.threadId),
            provider: ProviderDriverKind.make(driver),
            providerInstanceId:
              devInput.providerInstanceId === undefined
                ? null
                : ProviderInstanceId.make(devInput.providerInstanceId),
            since,
            resetsAt,
            autoResume: true,
            pendingTurnMessageId: null,
            releasedAt: null,
            releaseReason: null,
            updatedAt: since,
          })
          .pipe(Effect.orDie);
        holdsCreated += 1;
        yield* appendActivity(
          devInput.threadId!,
          PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
          `Provider usage limit reached — ${driver} window exhausted (dev), turns paused`,
          { driver, since, resetsAt, autoResume: true, percentUsed: 100, forced: true },
        );
      } else {
        holdsCreated = yield* actForDriver(hold);
      }
      return { holdsCreated, resetsAt };
    });

    const forceRecover: ProviderUsageWatcherShape["forceRecover"] = Effect.fn(
      "providerUsageWatcher.forceRecover",
    )(function* () {
      if (!devForceEnabled) {
        return yield* Effect.fail(
          new ProviderUsageDevError({
            message:
              "Dev force hooks are disabled (set T3TEAM_PROVIDER_USAGE_DEV_FORCE=1 to enable).",
          }),
        );
      }
      let released = 0;
      for (const driver of Array.from(heldDrivers.keys())) {
        released += yield* releaseDriver(driver, "dev-force-recover");
      }
      // Catch rows rehydrated for drivers the in-memory map does not hold.
      const remaining = [
        ...new Set((yield* holds.listActive().pipe(Effect.orDie)).map((row) => row.provider)),
      ];
      for (const driver of remaining) {
        released += yield* releaseDriver(driver, "dev-force-recover");
      }
      return { released };
    });

    const getDevState: ProviderUsageWatcherShape["getDevState"] = Effect.fn(
      "providerUsageWatcher.getDevState",
    )(function* () {
      return {
        held: [...heldDrivers.values()],
        holds: yield* holds.listActive().pipe(Effect.orDie),
        lastSampledAt,
      };
    });

    // ── Rehydrate: rebuild the in-memory held set from the rows ────────────
    for (const row of yield* holds.listActive().pipe(Effect.orDie)) {
      const existing = heldDrivers.get(row.provider);
      heldDrivers.set(row.provider, {
        driver: row.provider,
        since: existing?.since ?? row.since,
        resetsAt: existing?.resetsAt ?? row.resetsAt,
        instanceIds: existing?.instanceIds ?? [],
        percentUsed: 100,
      });
    }

    // ── The sweep loop: first pass 5s after boot, then every interval ─────
    const loop = Effect.gen(function* () {
      yield* Effect.sleep(Duration.millis(5_000));
      while (true) {
        yield* sweep().pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider usage watcher sweep failed", {
              cause: Cause.pretty(cause),
            }),
          ),
        );
        yield* Effect.sleep(Duration.millis(input.sweepIntervalMs));
      }
    }).pipe(Effect.forkScoped);

    return {
      sweep,
      checkThreadHeld,
      recordDeferredTurn,
      forceExhaust,
      forceRecover,
      getDevState,
    } satisfies ProviderUsageWatcherShape;
  });

const resolveSweepIntervalMs = (): number => {
  const raw = process.env["T3TEAM_PROVIDER_USAGE_SWEEP_MS"];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 5_000) return parsed;
  }
  return PROVIDER_USAGE_SWEEP_INTERVAL_MS;
};

export const T3TeamProviderUsageWatcherLive = Layer.effect(
  ProviderUsageWatcher,
  makeProviderUsageWatcher({
    sweepIntervalMs: resolveSweepIntervalMs(),
    devForceEnabled:
      process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "1" ||
      process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "true",
  }),
).pipe(Layer.provideMerge(ProviderUsageHoldRepositoryLive));
