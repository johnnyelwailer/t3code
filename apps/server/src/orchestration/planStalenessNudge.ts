/**
 * Plan-staleness nudge — the single system-reminder line appended to the
 * model's input when a thread's task list has gone stale, i.e. when at
 * least PLAN_STALENESS_NUDGE_THRESHOLD tool activity events were appended
 * since the last plan write (see ThreadPlanStalenessService for the count,
 * ProviderService.sendTurn for the injection point).
 *
 * One line, no more: the nudge must not become its own surface.
 *
 * @module planStalenessNudge
 */

/**
 * Tool activity events since the last plan write that make the plan stale.
 *
 * Chosen from real transcript data, not guessed: in the operator's Nexi Work
 * state DB (projection_thread_activities, read-only), the gap in `tool.started`
 * activities between consecutive `turn.plan.updated` writes across 65 threads
 * with 2+ plan writes (n=255 gaps) is p10=1, p25=2, p50=6, p75=35, p90=80,
 * p95=174, max=678; 45% of writes happen within ≤4 tool calls. The 75th
 * percentile (35) is the conservative boundary: 75% of plan writes land
 * within this cadence, so a plan older than 35 tool calls is in the
 * top quartile of drift and the tail that matters (threads running 150+ tool
 * calls after their last plan write — 12% of plan-bearing threads) is fully
 * covered. See the plan-staleness PR body for the full measurement.
 */
export const PLAN_STALENESS_NUDGE_THRESHOLD = 35;

/**
 * Renders the nudge line for a given plan age, or `undefined` below the
 * threshold. `planAge` is the number of tool activity events appended
 * since the last plan write.
 */
export function renderPlanStalenessNudge(planAge: number): string | undefined {
  if (planAge < PLAN_STALENESS_NUDGE_THRESHOLD) return undefined;
  return `Your task list is stale (${planAge} tool calls since last update). Update it now, before other work.`;
}
