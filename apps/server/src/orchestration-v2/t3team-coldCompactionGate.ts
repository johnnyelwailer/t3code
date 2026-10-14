/**
 * Cold-cache gate for local compaction: whether a compaction request on a native thread is
 * summarized by the route's local model (cold) or left to the driver's own `/compact` (warm).
 *
 * @module t3team-coldCompactionGate
 */
import type { OrchestrationV2Run } from "@t3tools/contracts";
import type { ColdLocalCompactionRouteDefinition } from "@t3team/pack-api";

const ACTIVE_RUN_STATUSES: ReadonlySet<OrchestrationV2Run["status"]> = new Set([
  "preparing",
  "starting",
  "running",
  "waiting",
]);

/** A queued run waits behind the compaction, so only a live run counts as work in flight. */
export const hasOtherActiveRun = (
  runs: ReadonlyArray<Pick<OrchestrationV2Run, "id" | "status">>,
  compactionRunId: OrchestrationV2Run["id"],
): boolean => runs.some((run) => run.id !== compactionRunId && ACTIVE_RUN_STATUSES.has(run.status));

export interface ColdCompactionGateInput {
  readonly route: ColdLocalCompactionRouteDefinition | undefined;
  readonly driver: string;
  /** Latest native context measurement; absent when the thread has none. */
  readonly usage: { readonly usedTokens: number; readonly reportedAt: string } | undefined;
  readonly nowMs: number;
  readonly otherRunActive: boolean;
}

export const isColdCompactionRouted = (input: ColdCompactionGateInput): boolean => {
  const { route, usage } = input;
  if (route === undefined || !route.enabled || route.driver !== input.driver) return false;
  if (input.otherRunActive || usage === undefined) return false;
  const idleMs = input.nowMs - Date.parse(usage.reportedAt);
  return usage.usedTokens >= route.minUsedTokens && idleMs >= route.ttlMs;
};
