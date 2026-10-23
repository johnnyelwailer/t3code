/**
 * The launch ledger's data shapes and service API (see t3team-WorkflowTriggerLaunchStore.ts).
 */
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "./Errors.ts";

/** One awaited inbox tuple, consumed up to (and including) the newest slot the caller saw. */
export interface TriggerInboxSlice {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly signalName: string;
  readonly key: string;
  readonly upToId: number;
}

export interface TriggerLaunchClaim extends TriggerInboxSlice {
  /** Also the run id the launch uses: a retry finding that run already launched it. */
  readonly launchId: string;
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly args: Record<string, unknown>;
  readonly claimedAt: string;
}

export type TriggerLaunchStatus = "pending" | "launched" | "failed";

export interface TriggerLaunchRow {
  readonly launchId: string;
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly args: Record<string, unknown>;
  readonly status: TriggerLaunchStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly claimedAt: string;
  readonly launchedAt: string | null;
}

/** What the limits need to know about a recipe's past launches. */
export interface TriggerLaunchHistory {
  /** Claimed-but-unlaunched rows plus launched runs still queued or running (recipe-wide). */
  readonly inFlight: number;
  /** Launches of the recipe claimed at or after `windowStartIso` (gave-up rows excluded). */
  readonly launchesInWindow: number;
  /** The newest claim per key of this trigger since `intervalStartIso`. */
  readonly lastClaimAtByKey: ReadonlyMap<string, string>;
}

export interface WorkflowTriggerLaunchStoreShape {
  /** Consume the slice and record a `pending` launch atomically; false when no slot was open. */
  readonly claim: (input: TriggerLaunchClaim) => Effect.Effect<boolean, ProjectionRepositoryError>;
  /** Consume the slice without a launch (a skipped or faulting event). */
  readonly consume: (
    input: TriggerInboxSlice & { readonly deliveredAt: string },
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly markLaunched: (input: {
    readonly launchId: string;
    readonly launchedAt: string;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Count a failed attempt; `giveUp` settles the row as `failed`, otherwise it retries at `nextAttemptAt`. */
  readonly markAttemptFailed: (input: {
    readonly launchId: string;
    readonly error: string;
    readonly nextAttemptAt: string;
    readonly giveUp: boolean;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Pending launches whose retry is due, oldest claim first. */
  readonly listDue: (input: {
    readonly nowIso: string;
    readonly limit: number;
  }) => Effect.Effect<ReadonlyArray<TriggerLaunchRow>, ProjectionRepositoryError>;
  readonly history: (input: {
    readonly recipeId: string;
    readonly triggerId: string;
    readonly windowStartIso: string;
    readonly intervalStartIso: string;
  }) => Effect.Effect<TriggerLaunchHistory, ProjectionRepositoryError>;
  /** The newest launches of one trigger (diagnostics). */
  readonly listRecent: (input: {
    readonly recipeId: string;
    readonly triggerId: string;
    readonly limit: number;
  }) => Effect.Effect<ReadonlyArray<TriggerLaunchRow>, ProjectionRepositoryError>;
  /** GC settled rows claimed before the cutoff; pending rows are never dropped. */
  readonly purgeSettledBefore: (
    cutoffIso: string,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}
