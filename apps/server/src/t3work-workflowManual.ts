/**
 * Single source of truth for the agent-facing "how to write a runbook" manual.
 *
 * Used in two places so an agent can both DISCOVER the format (the
 * `t3work.workflow.run` tool description) and RECOVER from a bad one (the manual
 * is appended to a `failed`/load-error result). Generic — every provider that
 * reaches the tool, over `/mcp` or the native catalog, gets the same guidance.
 *
 * The #1 misuse to prevent: agents treating a runbook as a place to dump a
 * generic Node script (`import fs`, file writing). A runbook is for AGENT
 * ORCHESTRATION — fanning work out to multiple agents and composing the results.
 *
 * @module t3work-workflowManual
 */

/**
 * Concise tool-description text — the BASICS only, since this is loaded into
 * context every turn. The exact syntax is discovered on demand (it rides the
 * failure result via {@link T3WORK_WORKFLOW_MANUAL}).
 */
export const T3WORK_WORKFLOW_TAGLINE =
  "Agent orchestration: run a structure that fans work out to several agents (parallel " +
  "or in sequence), enforces result contracts, and offloads trivial/known/repeatable steps " +
  "to scripts and tools so agents don't burn tokens on them. Use for complex or long work; " +
  "for a simple single-agent task, just do it directly — do not write one of these. For the " +
  'authoring syntax, call t3work_help("agent-orchestration") first.';

export const T3WORK_TIMERS_MANUAL = `DURABLE TIMERS — t3work workflow scheduling.

Use the injected waitUntil(epochMs) and now() globals. Add the schedule capability.
Do not import timer libraries, poll, use setTimeout, run a shell sleep, or rely on external cron.

One-shot wait (short waits of seconds show "Scheduled" / a due time in the workflow UI):

  export const meta = {
    name: 'short-reminder',
    capabilities: ['schedule', 'user'],
  } as const
  const SECOND = 1000
  await waitUntil(now() + 30 * SECOND)
  await thread.notifyUser('Thirty seconds passed.')
  return { reminded: true }

Recurring pattern (the workflow loop is the schedule):

  export const meta = {
    name: 'daily-review',
    capabilities: ['schedule', 'user'],
  } as const
  const DAY = 24 * 60 * 60 * 1000
  while (true) {
    await waitUntil(now() + DAY)
    const result = await agent('Review current risks.', { label: 'Review daily risks' })
    await thread.notifyUser(result)
  }

waitUntil persists the run as sleeping with its wake deadline. It releases active agent work,
survives server restarts, and resumes immediately during restart recovery when the deadline is
already overdue. now() is journaled, so replay derives the same deadline. Seconds, minutes,
hours, and days use the same API. The UI may round very short remaining times to "Due now";
that is display rounding, not polling or a lost timer.`;

/**
 * The full manual. Kept compact but complete enough that a small model can
 * author a valid runbook from it alone, and fix one from the error path.
 */
export const T3WORK_WORKFLOW_MANUAL = `AGENT-ORCHESTRATION MANUAL — what 't3work.workflow.run' runs.

REQUIRED INTENT (pass this beside source/workflowPath)
Every run must declare its contract:

  intent: {
    goal: 'Find concrete regressions in this change',
    expectedOutcome: 'A ranked report with file references and verification status',
    guardrails: ['Do not change files', 'Mark uncertainty clearly'],
  }

goal and expectedOutcome must be nonblank. guardrails must contain at least one nonblank item.

WHAT THIS IS FOR
It gives agents a STRUCTURE to follow: split a task into parts, run agents in parallel
or in sequence, force each part to return a specific result contract, then compose those
results. Use scripts/tools inside it for the trivial, already-known, repeatable steps
(verify, load data, transform) so agents don't spend tokens re-deriving them. It is NOT
a shell/Node script and NOT for simple work. If a task is a few steps you can do yourself
in this turn, DO IT DIRECTLY — do not write one of these.

Good tasks: "review this change from 3 independent angles in parallel then merge the
findings", "for each of these N modules spawn an agent to analyze it, then rank the
results", "research X across several sub-questions, dedupe, verify".

FORMAT (the 'source' you pass)
It is a workflow BODY in TypeScript. The engine injects the orchestration globals.
Import only { Schema } from "effect" when you need typed agent results or a structured
user decision. Do not import Node APIs. The meta export must precede executable code;
after that, the body runs top-to-bottom.

  export const meta = {
    name: 'review-change',
    description: 'Review a change across dimensions and synthesize',
    phases: [{ title: 'Review' }, { title: 'Synthesize' }],
  }

  phase('Review')
  const dims = ['correctness', 'security', 'performance']
  const findings = await parallel(
    dims.map((d) => () => agent(
      \`Review the change for \${d} issues. List concrete findings.\`,
      { label: \`Review \${d}\` },
    ))
  )

  phase('Synthesize')
  const report = await agent(
    \`Merge these reviews into one ranked report:\\n\${findings.filter(Boolean).join('\\n---\\n')}\`,
    { label: 'Synthesize reviews' },
  )
  return report

INJECTED GLOBALS (no imports; call them directly)
- agent(prompt, opts?)        one-shot agent on a fresh isolated thread; returns its text,
                              or a validated value with opts.schema. opts.model can pick a
                              different provider/model per call. Always pass a concise,
                              human-facing opts.label describing the work.
- spawnThread({name?,model?,retention?}) makes a multi-turn thread; it is ephemeral by default
                              (hidden from the sidebar but inspectable inline). Set
                              retention: 'retained' only when it must remain sidebar-visible.
                              Then t.askAgent(prompt,opts?), t.notifyAgent(msg),
                              t.askUser(question,opts?), t.notifyUser(msg).
- thread                      the chat this runbook was launched from (undefined if headless).
- thread.showWidget({ title, widgetCode, format? }) renders sandboxed inline HTML/SVG through
                              the typed widget attachment pipeline. Requires 'user'. Use this
                              for interactive/rich UI. Trusted notifyUser HTML is automatically
                              promoted to this sandboxed widget path for compatibility.
- parallel(thunks)            run () => ...  thunks concurrently (barrier). A failed thunk -> null.
- pipeline(items, ...stages)  per-item fan-out through stages, no barrier between them.
- phase(title)                start a progress group (title should match a meta.phases title).
- log(message)                emit a narrator line.
- tools.<group>.<name>(args)  call a host tool (group must be listed in meta.capabilities).
- now()                      journaled epoch milliseconds; replay returns the same value.
- waitUntil(epochMs)         durable scheduler wait. Requires capabilities: ['schedule'].
                              The run is persisted as sleeping with a wake time, survives
                              server restarts, and catches up immediately when an overdue
                              deadline is found after restart.
- args                        the workflow input (validated against meta.inputs if declared).

DURABLE TIMERS AND ROUTINES
For the focused timer reference and copyable examples, call t3work_help("timers").
Use waitUntil(now() + durationMs) for seconds, minutes, hours, or days. Do not poll, call a
shell sleep command, use setTimeout, or rely on external cron. waitUntil parks the run without
holding an agent turn; the host scheduler owns the wake-up.

One-off reminder:

  export const meta = {
    name: 'review-reminder',
    capabilities: ['schedule', 'user'],
  } as const
  const HOUR = 60 * 60 * 1000
  await waitUntil(now() + 3 * HOUR)
  await thread.notifyUser('The review window is due.')
  return { reminded: true }

Recurring interval pattern (the loop is the schedule):

  export const meta = {
    name: 'daily-check',
    capabilities: ['schedule', 'user'],
  } as const
  const DAY = 24 * 60 * 60 * 1000
  while (true) {
    await waitUntil(now() + DAY)
    const result = await agent(
      'Check the current state and report only actionable changes.',
      { label: 'Check daily changes' },
    )
    await thread.notifyUser(result)
  }

Each now() value and deadline is journaled, so replay is deterministic. A restart does not
restart the interval or lose the timer. If the server was down past the deadline, scheduler
recovery resumes the run instead of waiting another full interval. For a fixed wall-clock
calendar schedule, compute the next epoch deadline with replay-safe pure arithmetic from now(),
then pass it to waitUntil.

RULES
- No Node APIs (no fs, path, process) and no require(). Use the globals above.
- 'meta' must be the first exported declaration and a plain literal (no function calls in it).
- Prefer parallel()/pipeline() for fan-out; use phase()/log() so progress is visible.
- For human input, add capabilities: ['user']. Prefer thread.askUser(...) so the decision
  appears in the launch thread. A spawned child's askUser is also routed to that launch thread.
- Before askUser, surface the relevant results or evidence the decision depends on. Prefer one
  combined context-and-actions card by passing relevant resource refs as attachments when they
  are available. Otherwise call thread.notifyUser(...) with a concise evidence summary, then
  call askUser. Never make the user reconstruct context from earlier agent or tool results.
- Prefer thread.showWidget({ title, widgetCode, format: 'html' }) for HTML/SVG. Legacy trusted
  workflow HTML passed to notifyUser or askUser is auto-promoted to a sandboxed typed widget;
  it is never rendered as raw system text.
- Structured choice example:
    import { Schema } from "effect"
    export const meta = { name: 'approve', capabilities: ['user'] } as const
    const Choice = Schema.Literals(['approve', 'revise'])
    const decision = await thread.askUser('Choose:', { schema: Choice, label: 'Choose action' })
  An arbitrary options array is not supported; use a Schema so the UI can render controls.
- Return the final result at the end.

RESULT
Returns { runId, status: 'accepted'|'completed'|'suspended'|'failed', handoff: 'workflow-ui', output?, error? }.
accepted means the durable host owns the run. A successful workflow-ui handoff means end the
current host turn immediately with no follow-up assistant prose. Do not launch it again or poll
it; sleeping, user decisions, and other progress arrive through the existing workflow UI.
On 'failed', read 'error', fix the source per this manual, and run it again.`;
