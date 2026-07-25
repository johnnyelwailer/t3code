export function renderRecipeAuthoringGuide(): string {
  return `# Authoring T3Team Agent Orchestrations

A t3team workflow is a typed TypeScript module (\`<id>.workflow.ts\`) executed durably by t3team: every primitive call is journaled, so a run can suspend (waiting on a person or the clock), survive restarts, and resume by replaying the journal. A recipe (\`recipe.ts\` with \`defineRecipe\`) is the saved, launchable wrapper around a workflow. This is NOT a Claude Code skill/subagent or a Codex/CI workflow -- see AGENTS.md.

## The one rule everything follows from: replay

A workflow body may re-execute from the top at any time (resume after a suspension or restart). Journaled primitives return their recorded result instead of re-running.

\`Date.now()\`, \`new Date()\`, \`Math.random()\`, and \`crypto.randomUUID()\` are already safe -- they're overridden to route through the journal, so replay reproduces the same values. What breaks replay is bypassing the primitives: raw \`fetch\`, direct \`fs\` reads, \`process.env\`, or any side effect outside \`tools.*\`/\`scripts.*\`. Keep all effects inside those calls -- one call, one real execution, ever.

## Make the run visible (required, not decorative)

Runs execute without approval; the compensating contract is that every run is observable. Authors must:

- Declare \`meta\` (name, description, inputs, outputs, capabilities) -- it drives the plan card users see at launch.
- Use \`phase("Title")\` to group steps and \`log(...)\` at milestones -- both render live in the run timeline.
- Give asks short, specific labels/questions. If you bound coverage (top-N, sampling), \`log()\` what was dropped -- silent truncation reads as "covered everything."

## Suspension verbs

- \`askUser(question, { schema })\` -- parks the run until the user answers; a schema renders a decision card (choice/boolean/form). The run survives restarts while parked.
- \`askAgent(prompt, { schema })\` -- an agent turn; with a schema the reply is validated and retried up to 3 times, then \`SchemaExhaustedError\`. The agent's final text IS the return value -- prompt for data, not prose.
- \`waitUntil(when)\` -- sleeps durably until a deadline (needs the \`schedule\` capability). A deadline that passes during downtime fires on boot.

Declare capabilities honestly: \`user\` for askUser/notifyUser, \`schedule\` for waitUntil. They are the consent surface.

## Patterns

- Ask-then-act: gather one structured decision up front (\`askUser\` with a form schema), then act without further pauses.
- Fan-out: DEFAULT to \`pipeline(items, ...stages)\` -- no barrier between stages. Use \`parallel\` only when a stage genuinely needs ALL prior results together (dedup across items, early-exit on zero). Smell test: \`const a = await parallel(...); const b = transform(a); await parallel(b.map(...))\` -- if \`transform\` has no cross-item dependency, that barrier is wasted wall-clock; use pipeline.
- Schedule-until: \`while (!done) { ...; await waitUntil(nextCheck) }\` -- an immortal monitor. Keep each iteration's work inside primitives; keep iterations bounded per day (frequency floor applies).
- Structured agent output: always pass \`schema\` to \`askAgent\` when you need data. Never parse prose.
- Sub-workflows: \`workflow(ref, args)\` for a reusable unit; one nesting level only.

## Scale and scope

Match the orchestration to what was asked: a one-off task gets a small linear body; "audit thoroughly" justifies fan-out plus a verification phase. An orchestration doesn't need to be a saved recipe -- for a one-off multi-step task, write a temp orchestration and run it directly with \`t3team_orchestration_run\`, no permission-seeking. Save it as a recipe in the background, and only once it's proven reusable.
`;
}
