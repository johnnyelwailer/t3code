/**
 * One-click per-thread resource cleanup (flag `NEXI_FF_RESOURCE_PRESSURE`):
 * stop the agent session and the background jobs ONE thread spawned. Two
 * steps, so the confirm dialog can show exactly what will be signaled:
 *
 *  1. `server.previewThreadResourceCleanup` — the plan: every running job of
 *     the thread's session with its PID, the reason, and whether its ppid
 *     chain in a fresh process scan ends at this server (only verified PIDs
 *     become targets; the rest are listed as skipped, never signaled).
 *  2. `server.cleanupThreadResources` — SIGINT to exactly the confirmed
 *     PID + start-time identities (re-verified), then the agent session stop.
 *
 * Processes and jobs only: worktrees are never touched (unpushed work); the
 * policy-driven storage sweep stays the separate, broader action.
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, ThreadId } from "./baseSchemas.ts";

export const ResourcePressureCleanupInput = Schema.Struct({ threadId: ThreadId });
export type ResourcePressureCleanupInput = typeof ResourcePressureCleanupInput.Type;

/** A lineage-verified process the cleanup will SIGINT. */
export const ResourcePressureCleanupTarget = Schema.Struct({
  pid: PositiveInt,
  startTimeMs: NonNegativeInt,
  jobId: Schema.String,
  command: Schema.String,
  residentBytes: NonNegativeInt,
  reason: Schema.String,
});
export type ResourcePressureCleanupTarget = typeof ResourcePressureCleanupTarget.Type;

/** Listed in the dialog but never signaled (no PID, gone, or not our descendant). */
export const ResourcePressureCleanupSkipped = Schema.Struct({
  label: Schema.String,
  reason: Schema.String,
});
export type ResourcePressureCleanupSkipped = typeof ResourcePressureCleanupSkipped.Type;

export const ResourcePressureCleanupPlan = Schema.Struct({
  threadId: ThreadId,
  /** False when the flag is off; nothing else is filled in. */
  enabled: Schema.Boolean,
  targets: Schema.Array(ResourcePressureCleanupTarget),
  skipped: Schema.Array(ResourcePressureCleanupSkipped),
  /** The thread's live agent session, stopped through its provider; null when none. */
  agentSession: Schema.NullOr(Schema.Struct({ provider: Schema.String, reason: Schema.String })),
});
export type ResourcePressureCleanupPlan = typeof ResourcePressureCleanupPlan.Type;

export const ResourcePressureCleanupExecuteInput = Schema.Struct({
  threadId: ThreadId,
  /** Exactly the identities the user confirmed; each is re-verified before SIGINT. */
  targets: Schema.Array(Schema.Struct({ pid: PositiveInt, startTimeMs: NonNegativeInt })),
  stopAgentSession: Schema.Boolean,
});
export type ResourcePressureCleanupExecuteInput = typeof ResourcePressureCleanupExecuteInput.Type;

export const ResourcePressureCleanupResult = Schema.Struct({
  signaled: Schema.Array(PositiveInt),
  notSignaled: Schema.Array(Schema.Struct({ pid: PositiveInt, reason: Schema.String })),
  agentSessionStopped: Schema.Boolean,
  message: Schema.String,
});
export type ResourcePressureCleanupResult = typeof ResourcePressureCleanupResult.Type;
