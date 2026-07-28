/**
 * The durable-timers help topic (`t3team_help("timers")`), split out of
 * {@link ./t3team-workflowManual.ts} so each file carries one manual.
 *
 * Examples use the module body shape — imports plus a default-exported async function — because
 * that is the only shape the engine runs (Epic 25 §The engine API — imported, not injected).
 */

export const T3TEAM_TIMERS_MANUAL = `DURABLE TIMERS — t3team agent-orchestration scheduling.

Import waitUntil(epochMs) and now() from "@t3team/sdk". Add the schedule capability.
Do not import timer libraries, poll, use setTimeout, run a shell sleep, or rely on external cron.

One-shot wait (short waits of seconds show "Scheduled" / a due time in the orchestration UI):

  export const meta = {
    name: 'short-reminder',
    capabilities: ['schedule', 'user'],
  } as const
  const SECOND = 1000
  await waitUntil(now() + 30 * SECOND)
  await thread.notifyUser('Thirty seconds passed.')
  return { reminded: true }

Recurring pattern (the orchestration loop is the schedule):

  export const meta = {
    name: 'daily-review',
    capabilities: ['schedule', 'user'],
  } as const
  const DAY = 24 * 60 * 60 * 1000
  while (true) {
    await waitUntil(now() + DAY)
    const result = await agent('Review current risks.', { label: 'Review daily risks', capabilities: 'inherit' })
    await thread.notifyUser(result)
  }

waitUntil persists the run as sleeping with its wake deadline. It releases active agent work,
survives server restarts, and resumes immediately during restart recovery when the deadline is
already overdue. now() is journaled, so replay derives the same deadline. Seconds, minutes,
hours, and days use the same API. The UI may round very short remaining times to "Due now";
that is display rounding, not polling or a lost timer.`;
