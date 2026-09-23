/**
 * Session-level auto-retry for transient provider failures (GHE #306).
 *
 * The pure policy helpers live in `t3team-threadTransientTurnRetryPolicy.ts`,
 * the shared types and decision helpers in `t3team-threadTransientTurnRetryDecision.ts`,
 * the state machine in `t3team-threadTransientTurnRetryTracker.ts`,
 * the decision execution in `t3team-threadTransientTurnRetryDecisionExecution.ts`,
 * and the Live layer in `t3team-threadTransientTurnRetryReactor.ts`.
 * This module re-exports the public API at the original import path.
 *
 * @module t3team-threadTransientTurnRetry
 */
export {
  MAX_SESSION_TRANSIENT_RETRIES,
  IN_FLIGHT_SETTLE_MS,
  transientTurnRetryBackoffMs,
  transientTurnRetryDelayMs,
  truncateStopReason,
  watchdogStallReason,
  transientRetryInFlightText,
  transientRetryExhaustedText,
  readWatchdogStallWarning,
  classifyTransientTurnFailure,
  transientTurnReasonText,
} from "./t3team-threadTransientTurnRetryPolicy.ts";

export {
  type TransientTurnRetryState,
  type TransientTurnRetryDecision,
  type TransientTurnRetryTracker,
  type TransientTurnRetryTrackerOptions,
  decisionForTransient,
  stallDecisionFor,
} from "./t3team-threadTransientTurnRetryDecision.ts";

export { createTransientTurnRetryTracker } from "./t3team-threadTransientTurnRetryTracker.ts";

export { T3TeamThreadTransientTurnRetryLive } from "./t3team-threadTransientTurnRetryReactor.ts";
