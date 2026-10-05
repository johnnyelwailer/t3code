/**
 * Session-level auto-retry for transient provider failures (GHE #306).
 *
 * Classification: `orchestration-v2/t3team-transientRunFailure.ts`; policy
 * (budget, backoff, note texts): `t3team-threadTransientTurnRetryPolicy.ts`;
 * durable attempt counting: `t3team-threadTransientTurnRetryPlan.ts`; the
 * Live layer: `t3team-threadTransientTurnRetryReactor.ts`.
 *
 * @module t3team-threadTransientTurnRetry
 */
export {
  MAX_SESSION_TRANSIENT_RETRIES,
  transientTurnRetryBackoffMs,
  transientTurnRetryDelayMs,
} from "./t3team-threadTransientTurnRetryPolicy.ts";
export { T3TeamThreadTransientTurnRetryLive } from "./t3team-threadTransientTurnRetryReactor.ts";
