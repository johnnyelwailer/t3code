/**
 * Single source of truth for the agent-facing "how to write an agent
 * orchestration" manual.
 *
 * Used in two places so an agent can both DISCOVER the format (the
 * `t3team.orchestration.run` tool description) and RECOVER from a bad one (the
 * manual is appended to a `failed`/load-error result). Generic — every provider
 * that reaches the tool, over `/mcp` or the native catalog, gets the same guidance.
 *
 * The #1 misuse to prevent: agents treating an orchestration as a place to dump a
 * generic Node script (`import fs`, file writing). An orchestration is for AGENT
 * ORCHESTRATION — fanning work out to multiple agents and composing the results.
 *
 * The concept is "agent orchestration"; the FILE FORMAT it is authored in is
 * still `.workflow.ts` (see docs/t3team-mvp/25-workflow-engine.md § Naming), so
 * this module's own name and exported symbols keep the legacy spelling.
 *
 * @module t3team-workflowManual
 */

/**
 * Concise tool-description text — the BASICS only, since this is loaded into
 * context every turn. The exact syntax is discovered on demand (it rides the
 * failure result via {@link T3TEAM_WORKFLOW_MANUAL}).
 */
// The timers topic is its own help entry (`t3team_help("timers")`) and its own module, so this
// file stays the single orchestration manual rather than two manuals sharing a file.
export { T3TEAM_TIMERS_MANUAL } from "./t3team-workflowManualTimers.ts";

export const T3TEAM_WORKFLOW_TAGLINE =
  "Agent orchestration: run a structure that fans work out to several agents (parallel " +
  "or in sequence), enforces result contracts, and offloads trivial/known/repeatable steps " +
  "to scripts and tools so agents don't burn tokens on them. Use for complex or long work; " +
  "for a simple single-agent task, just do it directly — do not write one of these. For the " +
  'authoring syntax, call t3team_help("agent-orchestration") first.';

/**
 * The full manual. Kept compact but complete enough that a small model can
 * author a valid orchestration from it alone, and fix one from the error path.
 */
export const T3TEAM_WORKFLOW_MANUAL = `AGENT-ORCHESTRATION MANUAL — what 't3team.orchestration.run' runs.

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
It is an orchestration MODULE in TypeScript (file format: .workflow.ts): imports, a 'meta'
export, then the logic in a default-exported async function. Ordinary TypeScript — no injected
identifiers to memorize.

  import { agent, parallel, phase } from "@t3team/sdk"

The loader erases every import and binds those names from the run itself, so an import costs
nothing at runtime and needs no node_modules in the run directory — the same source shape works
whether you pass it inline or it lives in a repo (where it also typechecks). Import { Schema }
from "effect" for typed agent results or a structured user decision. No Node APIs.

'meta' must precede the function. Per-run VALUES are accessors, because a module-level import
cannot be a per-run binding: getArgs(), getThread(), getBudget(), getScripts(), getTools().

  export const meta = {
    name: 'review-change',
    description: 'Review a change across dimensions and synthesize',
    phases: [{ title: 'Review' }, { title: 'Synthesize' }],
  }

  export default async function run() {
    phase('Review')
    const dims = ['correctness', 'security', 'performance']
    const findings = await parallel(
      dims.map((d) => () => agent(
        \`Review the change for \${d} issues. List concrete findings.\`,
        { label: \`Review \${d}\`, capabilities: 'inherit' },
      ))
    )

    phase('Synthesize')
    return await agent(
      \`Merge these reviews into one ranked report:\\n\${findings.filter(Boolean).join('\\n---\\n')}\`,
      { label: 'Synthesize reviews', capabilities: 'inherit' },
    )
  }

THE ENGINE API (import the ones you use from "@t3team/sdk")
- agent(prompt, opts)         one-shot agent on a fresh isolated thread; returns its text,
                              or a validated value with opts.schema. opts.model can pick a
                              different provider/model per call. Always pass a concise,
                              human-facing opts.label describing the work.
                              opts.capabilities is REQUIRED: either 'inherit' to take this
                              workflow's own grant, or an explicit list such as
                              ['integration.read']. There is no default — a child that
                              inherits silently over-grants, and one granted nothing fails
                              later with a confusing "tool not enabled".
- spawnThread({capabilities,name?,model?,retention?}) makes a multi-turn thread; capabilities
                              is REQUIRED here too, same two forms. It is ephemeral by default
                              (hidden from the sidebar but inspectable inline). Set
                              retention: 'retained' only when it must remain sidebar-visible.
                              Then t.askAgent(prompt,opts?), t.notifyAgent(msg),
                              t.askUser(question,opts?), t.notifyUser(msg).
- getThread()                 the chat this orchestration was launched from (undefined if
                              headless). Below, 'thread' means its result.
- thread.showWidget({ title, widgetCode, format? }) renders sandboxed inline HTML/SVG through
                              the typed widget attachment pipeline. Requires 'user'. Use this
                              for interactive/rich UI. Trusted notifyUser HTML is automatically
                              promoted to this sandboxed widget path for compatibility. Color
                              EVERYTHING with the host theme variables (var(--background),
                              var(--success), var(--warning), var(--info), ...), never hard-code
                              hex colors, and render icons from the host sprite (t3w-icon)
                              instead of emoji — the same markup must work in light and dark.
                              Full authoring contract: t3team_help("widget-guidance").
- parallel(thunks)            run () => ...  thunks concurrently (barrier). A failed thunk -> null.
- pipeline(items, ...stages)  per-item fan-out through stages, no barrier between them.
- phase(title)                start a progress group (title should match a meta.phases title).
- log(message)                emit a narrator line.
- getTools().<group>.<name>(args) call a host tool (group must be listed in meta.capabilities).
- now()                      journaled epoch milliseconds; replay returns the same value.
- waitUntil(epochMs)         durable scheduler wait. Requires capabilities: ['schedule'].
                              The run is persisted as sleeping with a wake time, survives
                              server restarts, and catches up immediately when an overdue
                              deadline is found after restart.
- getArgs()                   the orchestration input (validated against meta.inputs if
                              declared).

DURABLE TIMERS AND ROUTINES
For the focused timer reference and copyable examples, call t3team_help("timers").
Use waitUntil(now() + durationMs) for seconds, minutes, hours, or days. Do not poll, call a
shell sleep command, use setTimeout, or rely on external cron. waitUntil parks the run without
holding an agent turn; the host scheduler owns the wake-up.

One-off reminder:

  export const meta = {
    name: 'review-reminder',
    capabilities: ['schedule', 'user'],
  } as const
  export default async function run() {
    const HOUR = 60 * 60 * 1000
    await waitUntil(now() + 3 * HOUR)
    await getThread().notifyUser('The review window is due.')
    return { reminded: true }
  }

Recurring interval pattern (the loop is the schedule):

  export const meta = {
    name: 'daily-check',
    capabilities: ['schedule', 'user'],
  } as const
  export default async function run() {
    const DAY = 24 * 60 * 60 * 1000
    while (true) {
      await waitUntil(now() + DAY)
      const result = await agent(
        'Check the current state and report only actionable changes.',
        { label: 'Check daily changes', capabilities: 'inherit' },
      )
      await getThread().notifyUser(result)
    }
  }

Each now() value and deadline is journaled, so replay is deterministic. A restart does not
restart the interval or lose the timer. If the server was down past the deadline, scheduler
recovery resumes the run instead of waiting another full interval. For a fixed wall-clock
calendar schedule, compute the next epoch deadline with replay-safe pure arithmetic from now(),
then pass it to waitUntil.

RULES
- No Node APIs (no fs, path, process) and no require(). Import the API above from "@t3team/sdk".
- 'meta' must precede the default-exported function and be a plain literal (no calls in it).
- Return the run's result from that function.
- Prefer parallel()/pipeline() for fan-out; use phase()/log() so progress is visible.
- For human input, add capabilities: ['user']. Prefer thread.askUser(...) so the decision
  appears in the launch thread. A spawned child's askUser is also routed to that launch thread.
- Before askUser, surface the relevant results or evidence the decision depends on. Prefer one
  combined context-and-actions card by passing relevant resource refs as attachments when they
  are available. Otherwise call thread.notifyUser(...) with a concise evidence summary, then
  call askUser. Never make the user reconstruct context from earlier agent or tool results.
- Prefer thread.showWidget({ title, widgetCode, format: 'html' }) for HTML/SVG. Legacy trusted
  orchestration HTML passed to notifyUser or askUser is auto-promoted to a sandboxed typed widget;
  it is never rendered as raw system text.
- Structured choice example:
    import { Schema } from "effect"
    export const meta = { name: 'approve', capabilities: ['user'] } as const
    const Choice = Schema.Literals(['approve', 'revise'])
    export default async function run() {
      return await getThread().askUser('Choose:', { schema: Choice, label: 'Choose action' })
    }
  An arbitrary options array is not supported; use a Schema so the UI can render controls.
- Return the final result at the end, and prefer RETURNING a structured object over narrating one:
  the host renders it as clean labelled lines, while prose renders as typed. t3team_help("reporting").

RESULT
Returns { runId, status: 'accepted'|'completed'|'suspended'|'failed', handoff: 'workflow-ui', output?, error? }.
accepted means the durable host owns the run. A successful workflow-ui handoff means end the
current host turn immediately with no follow-up assistant prose. Do not launch it again or poll
it; sleeping, user decisions, and other progress arrive through the existing orchestration UI.

On 'failed', read 'error' first:
- "Invalid inputs for workflow '<name>': ..." means the WORKFLOW is correct and YOUR launch
  arguments were wrong. Call t3team_orchestration_resume with the same runId and corrected
  'args' — never 'source', never t3team_orchestration_run again (that makes a duplicate card).
- Any other failure is a genuine source defect: fix the source, then call
  t3team_orchestration_resume with corrected 'source' (same-prefix replay). Only run again if no
  runId is available to resume.`;
