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
  "for a simple single-agent task, just do it directly — do not write one of these. The " +
  "authoring syntax is returned in the error if a run fails to parse.";

/**
 * The full manual. Kept compact but complete enough that a small model can
 * author a valid runbook from it alone, and fix one from the error path.
 */
export const T3WORK_WORKFLOW_MANUAL = `AGENT-ORCHESTRATION MANUAL — what 't3work.workflow.run' runs.

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
It is a workflow BODY in TypeScript. There are NO import statements — the engine
injects all globals. The very first statement is a pure 'export const meta' literal;
after that, the body runs top-to-bottom.

  export const meta = {
    name: 'review-change',
    description: 'Review a change across dimensions and synthesize',
    phases: [{ title: 'Review' }, { title: 'Synthesize' }],
  }

  phase('Review')
  const dims = ['correctness', 'security', 'performance']
  const findings = await parallel(
    dims.map((d) => () => agent(\`Review the change for \${d} issues. List concrete findings.\`))
  )

  phase('Synthesize')
  const report = await agent(
    \`Merge these reviews into one ranked report:\\n\${findings.filter(Boolean).join('\\n---\\n')}\`
  )
  return report

INJECTED GLOBALS (no imports; call them directly)
- agent(prompt, opts?)        one-shot agent on a fresh isolated thread; returns its text,
                              or a validated value with opts.schema. opts.model can pick a
                              different provider/model per call.
- spawnThread({name?,model?}) a retained multi-turn thread; then t.askAgent(prompt,opts?),
                              t.notifyAgent(msg), t.askUser(question,opts?), t.notifyUser(msg).
- thread                      the chat this runbook was launched from (undefined if headless).
- parallel(thunks)            run () => ...  thunks concurrently (barrier). A failed thunk -> null.
- pipeline(items, ...stages)  per-item fan-out through stages, no barrier between them.
- phase(title)                start a progress group (title should match a meta.phases title).
- log(message)                emit a narrator line.
- tools.<group>.<name>(args)  call a host tool (group must be listed in meta.capabilities).
- args                        the workflow input (validated against meta.inputs if declared).

RULES
- No 'import'/'require' and no Node APIs (no fs, path, process). Use the globals above.
- 'meta' must be the first statement and a plain literal (no function calls in it).
- Prefer parallel()/pipeline() for fan-out; use phase()/log() so progress is visible.
- Return the final result at the end.

RESULT
Returns { runId, status: 'completed'|'suspended'|'failed', output?, error? }.
On 'failed', read 'error', fix the source per this manual, and run it again.`;
