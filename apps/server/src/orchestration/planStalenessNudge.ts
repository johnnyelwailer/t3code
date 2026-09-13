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

/** Tool activity events since the last plan write that make the plan stale. */
export const PLAN_STALENESS_NUDGE_THRESHOLD = 15;

/**
 * Renders the nudge line for a given plan age, or `undefined` below the
 * threshold. `planAge` is the number of tool activity events appended
 * since the last plan write.
 */
export function renderPlanStalenessNudge(planAge: number): string | undefined {
  if (planAge < PLAN_STALENESS_NUDGE_THRESHOLD) return undefined;
  return `Your task list is stale (${planAge} tool calls since last update). Update it now, before other work.`;
}
