/**
 * Shared types and constants of the provider usage watcher (GHE #421).
 * The main module re-exports everything here.
 *
 * @module t3team-providerUsageWatcherTypes
 */
import type {
  ProviderRuntimeEvent,
  ProviderUsageSeverity,
  ServerProvider,
  ServerProviderUsageLimits,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";

import type {
  ProviderUsageHold,
  ProviderUsageHoldRepositoryShape,
} from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

/** How often due holds are checked against their reset moment. */
export const PROVIDER_USAGE_DEADLINE_CHECK_MS = 30_000;

/** Grace after the provider-reported reset moment before the pending turn is replayed. */
export const PROVIDER_USAGE_RESUME_GRACE_MS = 90_000;

/** Replay dispatches tried per hold before the user is asked to resend. */
export const PROVIDER_USAGE_MAX_REPLAY_ATTEMPTS = 3;

/** Hysteresis: a warning clears only below this, critical drops only below the next. */
export const PROVIDER_USAGE_WARNING_CLEAR_PERCENT = 75;
export const PROVIDER_USAGE_CRITICAL_CLEAR_PERCENT = 95;

/** Activity kinds the web banner derives from (open activity vocabulary). */
export const PROVIDER_USAGE_HOLD_ACTIVITY_KINDS = {
  started: "provider.usage-hold.started",
  released: "provider.usage-hold.released",
  autoResumeSet: "provider.usage-hold.auto-resume-set",
  warning: "provider.usage.warning",
  warningCleared: "provider.usage.warning-cleared",
} as const;

export type ProviderUsageHoldActivityKind =
  (typeof PROVIDER_USAGE_HOLD_ACTIVITY_KINDS)[keyof typeof PROVIDER_USAGE_HOLD_ACTIVITY_KINDS];

/** What the watcher last saw for one provider instance (one account). */
export interface InstanceUsageEntry {
  readonly driver: string;
  readonly limits: ServerProviderUsageLimits | undefined;
  /** Session-window severity; null when the instance reports no data. */
  readonly severity: ProviderUsageSeverity | null;
  /** Any window of the instance is at or above the critical threshold. */
  readonly exhausted: boolean;
}

export interface ProviderUsageWatcherDevState {
  readonly instances: ReadonlyArray<{ readonly instanceId: string } & InstanceUsageEntry>;
  readonly holds: ReadonlyArray<ProviderUsageHold>;
}

/** Dev-hook failure (dev-force hooks are off, or the thread cannot be held). */
export class ProviderUsageDevError extends Data.TaggedError("ProviderUsageDevError")<{
  readonly message: string;
}> {}

export interface ProviderUsageWatcherShape {
  /** Fold one provider-registry snapshot in: per-instance warnings + early recovery. */
  readonly applyProviders: (providers: ReadonlyArray<ServerProvider>) => Effect.Effect<void>;
  /** Observe one provider runtime event: record usage-limited failures, clear answered holds. */
  readonly onRuntimeEvent: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
  /** Release (and replay) every hold whose reset moment plus grace has passed. */
  readonly releaseDue: () => Effect.Effect<void>;
  /** Dev hook: hold one thread's latest user message as if its turn hit the limit. */
  readonly forceExhaust: (input: {
    readonly threadId: string;
    readonly providerInstanceId?: string;
    readonly resetsInMs?: number;
  }) => Effect.Effect<{ readonly resetsAt: string }, ProviderUsageDevError>;
  /** Dev hook: release every active hold through the real replay path. */
  readonly forceRecover: () => Effect.Effect<{ readonly released: number }, ProviderUsageDevError>;
  /** Dev hook: last-seen instance usage + active hold rows. */
  readonly getDevState: () => Effect.Effect<ProviderUsageWatcherDevState>;
}

export class ProviderUsageWatcher extends Context.Service<
  ProviderUsageWatcher,
  ProviderUsageWatcherShape
>()("t3/t3team-providerUsageWatcherTypes/ProviderUsageWatcher") {}

/** In-memory mirror of one active hold row — enough to decide without a DB read. */
export interface HeldThread {
  readonly instanceId: string | null;
  readonly since: string;
  readonly resetsAt: string | null;
}

/** Mutable in-memory state. The hold rows are the durable truth; this is a cache. */
export interface ProviderUsageWatcherState {
  readonly instances: Map<string, InstanceUsageEntry>;
  /**
   * Active holds by thread id (rehydrated at boot), so the hot snapshot
   * stream and every turn outcome decide from memory, not a DB read.
   */
  readonly heldThreads: Map<string, HeldThread>;
  /** Failed replay dispatches per thread, bounded by {@link PROVIDER_USAGE_MAX_REPLAY_ATTEMPTS}. */
  readonly replayFailures: Map<string, number>;
}

/** Everything the extracted watcher steps need. Built once by the layer. */
export interface ProviderUsageWatcherDeps {
  readonly engine: Pick<OrchestrationEngineShape, "dispatch">;
  readonly query: Pick<ProjectionSnapshotQueryShape, "getThreadDetailById">;
  readonly holds: ProviderUsageHoldRepositoryShape;
  readonly state: ProviderUsageWatcherState;
  readonly appendActivity: (
    threadId: string,
    kind: ProviderUsageHoldActivityKind,
    summary: string,
    payload: unknown,
  ) => Effect.Effect<void>;
}
