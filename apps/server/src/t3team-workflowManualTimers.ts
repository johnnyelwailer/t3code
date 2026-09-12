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

KEEPING THE LAUNCH THREAD WORKING (a thread that continues on its own)
The pattern above reports to the HUMAN. It does not give the launching thread anything to do,
so that thread still stops after its current turn and waits for a person. To make a thread keep
working on its own, the routine must drive a TURN on the thread that launched it, with
thread.askAgent — the same launch-thread verb the describe-rewrite workflow uses. Each wake
becomes a turn in that thread, so the thread is both the worker and the log:

  export const meta = {
    name: 'keep-working',
    capabilities: ['schedule'],
  } as const
  const MINUTES = 60 * 1000
  while (true) {
    await waitUntil(now() + 20 * MINUTES)
    await thread.askAgent(
      'Continue the standing goal. Do the next item, update the plan as you go, '
      + 'and stop when there is nothing left to do.',
      { label: 'Heartbeat' },
    )
  }

thread.askAgent targets the LAUNCH thread — never agent() or spawnThread(), which run the work
somewhere else and leave the launch thread idle. That distinction is the whole difference between
a routine that reports and a thread that keeps going.

Give the turn a durable place to read its plan from (the thread's task journal, an issue, a file);
a wake that only says "continue" has no memory of what continue means once the context window has
been compacted. End the loop on a real condition rather than running forever with nothing to do.

waitUntil persists the run as sleeping with its wake deadline. It releases active agent work,
survives server restarts, and resumes immediately during restart recovery when the deadline is
already overdue. now() is journaled, so replay derives the same deadline. Seconds, minutes,
hours, and days use the same API. The UI may round very short remaining times to "Due now";
that is display rounding, not polling or a lost timer.`;
