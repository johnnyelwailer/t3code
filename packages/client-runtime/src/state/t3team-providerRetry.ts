/**
 * Provider-agnostic retry state for the composer banner: the live in-turn retry (a running
 * `error` item carrying `retry`, as Codex, Claude and Nexplore emit it) and the failed-run
 * transient recovery the host's transient-turn retry arms (`thread.transientRecovery`).
 * Shared by web and mobile.
 *
 * @module t3team-providerRetry
 */
import {
  ProviderDriverKind,
  TRANSIENT_RECOVERY_FAILURE_CLASS,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TransientRecovery,
  type RunId,
} from "@t3tools/contracts";
import {
  latestRootProviderFailure,
  latestUnheldRun,
} from "@t3tools/shared/orchestrationV2ThreadError";
import * as DateTime from "effect/DateTime";

// The quiet structure: a full projection is assignable, and only error items (which never
// stream) and thread/run fields are read here.
import type { ThreadStructure } from "./models.ts";

import { resolveProviderInstanceDisplayName } from "./providerInstanceDisplay.ts";

const LIVE_RUN_STATUSES = new Set(["preparing", "starting", "running", "waiting"]);

type ErrorItem = Extract<OrchestrationV2ThreadProjection["turnItems"][number], { type: "error" }>;

export interface ActiveProviderRetry {
  readonly itemId: string;
  readonly attempt: number;
  readonly maxAttempts: number | null;
  readonly retryDelayMs: number | null;
  /** When the retry item was last written (ISO); the next try is `updatedAt + retryDelayMs`. */
  readonly updatedAt: string;
  readonly cause: string;
  readonly providerLabel: string;
}

function providerLabel(projection: ThreadStructure): string {
  const instanceId = projection.thread.providerInstanceId;
  const driver = projection.providerSessions.findLast(
    (session) => session.providerInstanceId === instanceId,
  )?.driver;
  return resolveProviderInstanceDisplayName({
    instanceId,
    driver: driver ?? ProviderDriverKind.make(instanceId),
  });
}

/** The newest still-running provider retry of a live run; null once it recovered or failed. */
export function deriveActiveProviderRetry(projection: ThreadStructure): ActiveProviderRetry | null {
  const liveRunIds = new Set(
    projection.runs.filter((run) => LIVE_RUN_STATUSES.has(run.status)).map((run) => run.id),
  );
  if (liveRunIds.size === 0) return null;
  let newest: ErrorItem | null = null;
  for (const item of projection.turnItems) {
    if (item.type !== "error" || item.status !== "running" || item.retry === undefined) continue;
    if (item.runId === null || !liveRunIds.has(item.runId)) continue;
    if (
      newest === null ||
      DateTime.toEpochMillis(item.updatedAt) > DateTime.toEpochMillis(newest.updatedAt)
    ) {
      newest = item;
    }
  }
  if (newest?.retry === undefined) return null;
  return {
    itemId: newest.id,
    attempt: newest.retry.attempt,
    maxAttempts: newest.retry.maxAttempts,
    retryDelayMs: newest.retry.retryDelayMs,
    updatedAt: DateTime.formatIso(newest.updatedAt),
    cause: newest.failure.message,
    providerLabel: providerLabel(projection),
  };
}

export interface TransientFailureRecovery {
  readonly runId: RunId;
  readonly cause: string;
  readonly providerLabel: string;
  /** The host's recovery for this exact run; null before it armed, or when it never will. */
  readonly recovery: OrchestrationV2TransientRecovery | null;
}

/**
 * The latest run failed transiently: its root failure carries the transient-provider class, or
 * the host armed a recovery for it (the host's classifier also accepts `retryable` failures).
 */
export function deriveTransientFailureRecovery(
  projection: ThreadStructure,
): TransientFailureRecovery | null {
  const run = latestUnheldRun(projection.runs);
  const failure = latestRootProviderFailure(run, projection.turnItems);
  if (run === null || failure === null) return null;
  const stored = projection.thread.transientRecovery ?? null;
  const recovery = stored?.runId === run.id ? stored : null;
  if (failure.class !== TRANSIENT_RECOVERY_FAILURE_CLASS && recovery === null) return null;
  return {
    runId: run.id,
    cause: failure.message,
    providerLabel: providerLabel(projection),
    recovery,
  };
}
