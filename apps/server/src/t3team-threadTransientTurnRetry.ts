/**
 * Session-level auto-retry for transient provider failures (GHE #306).
 *
 * Classification: `orchestration-v2/t3team-transientRunFailure.ts`; policy
 * (budget, backoff, note texts): `t3team-threadTransientTurnRetryPolicy.ts`;
 * durable attempt counting: `t3team-threadTransientTurnRetryPlan.ts`; the
 * failed-run handling: `t3team-threadTransientTurnRetryReactor.ts`; Live layer:
 * `t3team-threadTransientTurnRetryLive.ts`.
 *
 * @module t3team-threadTransientTurnRetry
 */
export { T3TeamThreadTransientTurnRetryLive } from "./t3team-threadTransientTurnRetryLive.ts";
