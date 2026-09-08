/**
 * Shared types, constants, and pure helpers for the provider usage-limit
 * watcher (GHE #421, phase 2). Split out of `t3team-providerUsageWatcher.ts`
 * for the additive LOC budget; the main module re-exports everything here.
 *
 * @module t3team-providerUsageWatcherTypes
 */
import { ProviderDriverKind, ProviderInstanceId, type ServerSettings } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type ProviderUsageHold } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import type { ProviderUsageHoldRepositoryShape } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProviderServiceShape } from "./provider/Services/ProviderService.ts";
import type { ServerSettingsService } from "./serverSettings.ts";
import {
  PROVIDER_USAGE_CLAUDE_DRIVER,
  PROVIDER_USAGE_CODEX_DRIVER,
} from "./provider/t3team-providerUsageSampler.ts";

/** Sweep cadence while the watcher is active. */
export const PROVIDER_USAGE_SWEEP_INTERVAL_MS = 60_000;

/** Grace after the provider-reported reset moment before the time-based recovery fires. */
export const PROVIDER_USAGE_RECOVER_GRACE_MS = 90_000;

export const isUsageDriver = (driver: string): boolean =>
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
>()("t3/t3team-providerUsageWatcherTypes/ProviderUsageWatcher") {}

/**
 * Resolve the driver kind a turn would run on: the thread's model-selection
 * instance first (what the NEXT turn will use), the session's provider name
 * as fallback (what the LAST turn used).
 */
export const driverForThread = (
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

/**
 * Recovery rule for one held driver:
 *  - a fresh sample below critical wins (early recovery / plan change);
 *  - otherwise, when the provider reported a reset moment and it has
 *    passed (plus grace), recover on TIME — the session-scoped sampling
 *    rule may have nothing to sample on an idle machine, and the rolling
 *    window does reset on schedule;
 *  - with no reported reset moment, only a below-critical sample recovers.
 */
export const isRecovered = (
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

/**
 * Mutable in-memory watcher state (held set, warning set, sweep bookkeeping).
 * Rehydrated from the hold rows at boot; not itself persisted.
 */
export interface ProviderUsageWatcherState {
  /** In-memory held set, keyed by driver kind. Rehydrated from the rows. */
  readonly heldDrivers: Map<string, ProviderUsageInstanceHold>;
  /** In-memory warning set, keyed by driver kind. Not persisted. */
  readonly warningDrivers: Map<
    string,
    { readonly percentUsed: number; readonly resetsAt: string | null }
  >;
  lastSampledAt: string | null;
  sweepInFlight: boolean;
}

/**
 * Everything the extracted watcher steps (sweep / gate / act / release /
 * dev hooks) need. Built once by `makeProviderUsageWatcher`.
 */
export interface ProviderUsageWatcherDeps {
  readonly settingsService: ServerSettingsService["Service"];
  readonly providerService: ProviderServiceShape;
  readonly engine: OrchestrationEngineShape;
  readonly holds: ProviderUsageHoldRepositoryShape;
  readonly devForceEnabled: boolean;
  readonly state: ProviderUsageWatcherState;
  readonly nowIso: () => string;
  readonly appendActivity: (
    threadId: string,
    kind: ProviderUsageHoldActivityKind,
    summary: string,
    payload: unknown,
  ) => Effect.Effect<void>;
}
