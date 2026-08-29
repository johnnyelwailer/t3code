# Epic 25: Agent Orchestration Engine

## Naming

The concept is **agent orchestration**. "Workflow" and "runbook" were earlier names for the
same thing; prose, headings, tool descriptions, and UI copy say _orchestration_.

Three things deliberately keep the legacy spelling, and renaming them would be a breaking
change, not a cleanup:

- **The file format is still `.workflow.ts`**, authored with `export const meta = {...}` and
  referenced via `defineWorkflow` / `WorkflowRef` / `workflowPath`. Every existing recipe and
  the SDK's public authoring API depend on it.
- **Engine internals** — module filenames (`t3team-workflow*.ts`), exported symbols, DB tables
  and columns, journal `refId` / `PrimitiveKind` strings (replay-stable: renaming them breaks
  resume of in-flight runs), and the `handoff: 'workflow-ui'` wire literal.
- **The old tool ids remain as deprecated aliases.** `t3team_workflow_run` / `_status` /
  `_resume` (MCP) and `t3team.workflow.run` / `.status` / `.resume` (canonical broker) resolve
  to the `t3team_orchestration_*` / `t3team.orchestration.*` names and dispatch to the same
  handlers, so pack configs and already-running agents keep working. Prefer the new names.

## Purpose

This epic defines the **TS-native, replay-based durable-execution orchestration engine** that
backs every action recipes can launch, every cross-thread interaction, and every script
that t3team runs on a user's behalf.

It supersedes the step-union JSON model and the forward-only execution loop described in
[Epic 16 — Orchestrations](./16-action-recipes.md#orchestrations). Recipes, surfaces, applicability,
and discovery are still owned by Epic 16; this epic owns the **engine** and the **author
surface**.

Treat this doc as authoritative for:

- orchestration file shape (`.workflow.ts`),
- the `meta` block contract,
- the engine API the orchestration body imports,
- the durable-execution / replay model,
- the determinism contract authors must follow (and how the engine enforces it),
- the `Handle<R>` pattern for primitives that fire something into the system,
- error classes and the orchestration-catchable taxonomy,
- capability gating via `meta.capabilities`,
- how recipes thread typed orchestration references into views.

## Why now

The current orchestration runtime is a forward-only cursor over a persisted step list (see
[Epic 16 — Stateless, forward-only execution](./16-action-recipes.md)). It enables resume
across a single `collect-input` checkpoint and isolates per-step failures, but it cannot
express the things authors actually want:

- branching on the outcome of a previous step (try/catch, if/else),
- composing multiple LLM calls or scripts with intermediate transforms,
- structured request/response across threads or child sessions,
- escalation to the user mid-run with a typed reply,
- waiting on multi-hour or multi-day external events,
- safely calling another orchestration as a sub-routine.

Today's authoring path is also a step-array of `{kind, …}` JSON objects with embedded
expression strings — exactly the heavy-JSON-config pattern that
[the project's authoring philosophy](./16-action-recipes.md#plugin-modules) rejects.

The new engine is **a real TypeScript orchestration body** that runs under replay-based
durable execution (Temporal / Restate / DBOS / Inngest idiom). Authors write idiomatic
async TS with `try`/`catch`/`if`/`for` and call typed primitives. The engine journals
every primitive call and replays the body on resume to reach the next live call.

## Orchestration file shape (`.workflow.ts`)

An orchestration lives in its own `.workflow.ts` file. There is no `defineWorkflow(async (ctx) => …)`
wrapper inside the file — the body **is** the function:

```ts
// .t3team/recipes/pr-review/actions/approve-and-merge.workflow.ts
import { Schema } from "effect";
import { githubWrite } from "@t3team/sdk/groups";

export const Inputs = Schema.Struct({
  prId: Schema.String,
});

export const Outputs = Schema.Union(
  Schema.Struct({ status: Schema.Literal("merged"), sha: Schema.String }),
  Schema.Struct({ status: Schema.Literal("blocked"), reason: Schema.String }),
);

export const meta = {
  name: "pr-review.approve-and-merge",
  description: "Approve a PR and merge it, escalating on protected-branch errors.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user", githubWrite], // engine feature + typed group ref
  phases: [{ title: "Approve" }, { title: "Merge" }] as const, // `as const` types phase() against these titles
} as const;

const input = Schema.decodeSync(Inputs)(args);

phase("Approve"); // typed against meta.phases (via `as const`)
await tools.github.pullRequest.approve({ id: input.prId });

phase("Merge");
try {
  const { sha } = await tools.github.pullRequest.merge({ id: input.prId });
  return { status: "merged", sha };
} catch (e) {
  if (e instanceof PermissionDeniedError) {
    const ask = await user.ask({
      title: "Branch protected — request admin override?",
      responseSchema: Schema.Struct({ proceed: Schema.Boolean }),
    });
    const decision = await ask.response;
    if (!decision.proceed) {
      return { status: "blocked", reason: "Branch protected; user declined override." };
    }
    const { sha } = await tools.github.pullRequest.merge({
      id: input.prId,
      adminOverride: true,
    });
    return { status: "merged", sha };
  }
  throw e;
}
```

Three things make this file shape work under replay:

1. **`meta` is the first non-`const`/non-`import` statement** and is itself a pure
   literal (or references to top-level `const`s declared above it in the same file). The
   loader evaluates the consts in a minimal context (no engine primitives) and then extracts
   `meta` without running the body — needed for the launcher UI, capability gating, and
   applicability matching.
2. **The body is implicit async with top-level await.** No `async function` wrapper; the
   engine wraps the module's top-level statements.
3. **`args` is read with `getArgs<T>()`**, validated against `meta.inputs` _before_ the body runs. The
   `Schema.decodeSync(Inputs)(args)` line gives the body a typed handle without a build
   step.

Files conventionally live alongside the recipe that owns them, but orchestrations can also
live at the project root for shared use:

```text
.t3team/
  recipes/
    pr-review/
      recipe.ts
      actions/
        start-review.workflow.ts
        approve-and-merge.workflow.ts
        request-changes.workflow.ts
      views/
        PrItem.tsx
  workflows/
    release-notes-from-pr.workflow.ts       # shared, no recipe owner
```

Discovery is by filesystem scan for `*.workflow.ts`. Ownership comes from where
`defineWorkflow(path)` is called, not from where the file sits.

The `.t3team` paths in this epic are the current project-local authoring convention. Under
Epic 36, generated/synced state should move to host app-data, and repo files should remain
only for explicitly project-owned orchestration source.

## The `meta` block

```ts
export const meta = {
  name: string;                          // required, kebab-case, unique within the project
  description: string;                   // required, one sentence
  inputs?:  Schema.Schema<unknown>;      // Effect Schema; validated before body runs
  outputs?: Schema.Schema<unknown>;      // Effect Schema; validated before result is returned
  capabilities?: ReadonlyArray<EngineCapability | ToolGroupRef>;   // see §Capability gating
  phases?: ReadonlyArray<{ title: string; detail?: string }>;       // progress UI groups; declare with `as const` for typed phase() calls
  model?: ModelSelection;                // default model for agent / askAgent calls
};
```

### Static-extraction rules

`meta` is read at orchestration-load time **before** the body runs. The loader evaluates only
the top-level `const` declarations referenced by `meta` (e.g. `Inputs`, `Outputs`) in a
context that exposes no engine primitives. This is what makes capability gating and
permission UI safe to display before the user authorizes execution.

What's allowed in `meta`:

- Pure literals.
- Identifiers bound to top-level `const`s declared above `meta` in the same file.
- Effect Schema combinators (`Schema.Struct`, `Schema.Union`, `Schema.Literal`, etc.) —
  these are pure and side-effect-free.
- Value imports from the engine's pure-modules allowlist:
  - `effect` (Schema combinators, etc.)
  - `@t3team/sdk/groups` (typed `ToolGroupRef`s)
  - `@t3team/sdk/models` (typed `ModelRef`s; see [§Model selection](#model-selection))
  - `@t3team/sdk/surfaces` (typed surface placement consts — optional; raw `RecipeSurface`
    literal strings also work since they're a closed-set Schema.Literals union)
  - any other modules the SDK adds to the allowlist in future releases

  Project-local modules are **not** allowlisted — `meta` cannot import from
  `./something.ts`. Use top-level `const` declarations in the same file instead.

What's forbidden in `meta`:

- Function calls that touch imported engine verbs (`agent`, `scripts.*`, `tools.*`, `thread.*`,
  `child.*`, `user.*`, `ui.*`, `wait`, …) — these aren't bound during meta extraction
  and will throw.
- Any expression with side effects (reads from `fs`, `process`, `globalThis`, …).
- Conditional logic (`?:`, `&&`, `||` in identity-affecting positions) — keep `meta`
  declarative.

### Model selection

`meta.model` selects the default LLM for `agent` / `askAgent` calls. Per the
type-safety principle, the model identifier is a typed `ModelRef` from the SDK's
`models.*` registry, not a free-form string. Provider instance ids stay as strings
because they reference user-configured provider instances (dynamic per installation,
not knowable at SDK build time):

```ts
import { models } from "@t3team/sdk/models";

export const meta = {
  // …
  model: {
    provider: "anthropic-primary", // project-configured provider instance id (string)
    model: models.anthropic.claudeHaiku45, // typed ModelRef — autocomplete + typo-safe
  },
} as const;
```

`models.*` is a typed tree (imported from `@t3team/sdk`) mirroring the providers and model slugs the SDK knows
about (`models.anthropic.claudeOpus47`, `models.openai.gpt5_4`, etc.). Each leaf is a
`ModelRef` whose `id` is the canonical provider-scoped slug. The engine still passes the
string slug to the provider adapter; the type is what authors interact with.

`meta.model` is the orchestration-wide default. Individual `agent(prompt, { model })` /
`askAgent(prompt, { model })` calls can override per-call (same `{ provider, model: ModelRef }`
shape).

#### Model cascade — `models: [...]`

A single `model` pins a provider that may not be configured on the machine the orchestration runs on.
`models` is the fallback ladder for that: an ordered list of candidate rungs, walked HOST-side
against the live provider registry, first available one wins.

```ts
await agent("Judge this gate", {
  label: "Judge gate",
  models: [
    { instanceId: "nexplore", model: "minimax-m2.7-reap-139b-q4-160k" }, // instance + model
    { instanceId: "nexplore", model: "qwen3.6-35b-a3b-q6-192k:nothink" },
    { instanceId: "claudeAgent" }, // instance only — its default/matching model
    { model: models.anthropic.claudeOpus48 }, // model only — the run's CURRENT instance
  ],
  effort: "high",
});
```

Rules:

- **Availability** is exactly `t3team.thread.start_child`'s definition (same resolver,
  `resolveStartChildModelSelection`): the instance exists, its driver is available, it is
  installed and enabled, and it owns the requested model. A rung that fails any of these falls
  through — it is a skip, not an error.
- **Nothing available** → the run's current/default selection is kept. A cascade is a preference
  ladder, never a precondition, so it cannot fail a step on availability alone.
- **Precedence**: an explicit single `model` **wins**; `models` is only consulted when no single
  model was named (per-call `model` also beats a thread-level `models` from `spawnThread`).
- **`effort` composes**: the tier is mapped onto the CHOSEN rung's own reasoning control.
- **Diagnostics**: the winning rung and every skipped rung (with the reason) are narrated through
  `log()` and emitted as the step's activity detail — a silent switch of brain is undebuggable.
- **Replay determinism**: the ladder is resolved through ONE journaled `model.resolve` primitive
  whose reply is the chosen `ModelSelection`. A resume replays that recorded reply instead of
  re-probing a registry whose availability may have changed, so the following `thread.turn`
  re-derives the same payload and the same `argsHash`. A body that passes no `models` fires no
  `model.resolve` at all — its journal is byte-identical to one written before the option existed.
- `spawnThread({ models })` resolves the ladder **once**, on the thread's first ask, and reuses
  that choice for every later ask on the thread. The `thread.create` itself carries no resolved
  model (it is fired one-way, before any await); the turn's selection is what runs.

## The engine API — imported, not injected

An orchestration body is a **normal TypeScript module**. Engine APIs are ordinary named imports
from `@t3team/sdk`:

```ts
import { agent, getArgs, getThread, phase } from "@t3team/sdk";

export const meta = { name: "pr.review", inputs: Inputs, outputs: Outputs } as const;

export default async function run() {
  const { prTitle } = getArgs<Inputs>();
  const thread = getThread();

  phase("Review");
  const summary = await agent(`Summarize ${prTitle}`, { label: "Summarize PR", schema: Summary });
  await thread?.notifyUser(summary.text);

  return { reviewed: true };
}
```

The body is a **default-exported async function**, not top-level statements. That is forced by ESM and
is not cosmetic: the current design wraps the body in `(async () => { … })()` precisely so top-level
`await` AND the body's top-level `return` are legal (`t3team-sdk.loader.ts`). A real module cannot have
a top-level `return`, so the outputs have to come from somewhere — a returned value from an exported
function is the plainest option, keeps `await` legal inside, and gives the outputs an inferable type
instead of one recovered from the last expression of a script.

**There are no injected globals.** An earlier revision of this epic specified the opposite — the
engine injecting `agent` / `phase` / `thread` / `args` into the body scope, with typing supplied by
a `.workflow.ts`-specific ambient `.d.ts` shipped from `@t3team/workflow-sdk`. That is retired, for
two reasons:

1. **The compensating mechanism was never built.** No `@t3team/workflow-sdk` package and no ambient
   `.d.ts` exist, so bodies do not typecheck at all: `Cannot find name 'thread'`, `'phase'`,
   `'agent'`, plus top-level-`await` errors under a normal `tsconfig`. The globals design was only
   ever type-safe on paper.
2. **Nothing required it.** `recipe.ts` and `scripts/<name>.ts` already import from `@t3team/sdk`
   and typecheck today; only the body was special.

### How an imported verb finds its run

The same way an imported tool handler already does. `withWorkflowRuntime(runtime, run)` binds the
active run into the SDK's `AsyncLocalStorage` (`runtimeStorage`), and each exported verb reads it
with `runtimeStorage.getStore()`. `defineTool` handlers have worked this way since Epic 25 landed —
calling one outside a run throws _"was called outside a workflow runtime"_ — so an imported `agent()`
needs no new machinery, just the same lookup.

Consequences the engine must honour:

- The body is loaded as an ESM module, not wrapped in `(async () => { … })()` with its imports
  blanked. Top-level `await` is legal because the module is ESM.
- Per-run values are **accessors**, not bindings: `getArgs<T>()` (validated against `meta.inputs`
  before the body runs), `getThread()` (`Thread | undefined` — `undefined` when headless), and
  `getBudget()`. A module-level `import` cannot be a per-run value, and an accessor keeps the run
  boundary explicit rather than hiding it in a magic binding.
- Static analysis (`deriveWorkflowShape`, the determinism and capability audits) resolves verbs by
  their **imported binding** rather than by bare identifier. That is strictly more precise: a local
  variable named `agent` can no longer be mistaken for the engine verb.
- Determinism rules are unchanged. What is banned is banned because it is non-deterministic
  (`Date.now()` outside the journal, `Math.random()`, ambient `fs`), not because it was un-injected.

### Migration

Existing bodies gain an import line and two accessor calls; nothing else about them changes. A body
with no import of an engine verb it uses now fails typecheck instead of failing at run time, which
is the point.

> **Implementation status — LANDED.** Bodies reach the engine through imports. `bodyApiStorage`
> (AsyncLocalStorage) + `withBodyApi` bind the run's surface; `t3team-sdk.engineApi.ts` exports the
> verbs and reads it — the same mechanism `defineTool` handlers already used. Per-run VALUES are
> accessors (`getArgs`/`getThread`/`getBudget`/`getScripts`/`getTools`), because a module-level import
> cannot be a per-run binding. `deriveWorkflowShape` and the determinism/capability audits resolve
> verbs by imported binding (`t3team-sdk.workflowShapeBindings.ts`), so `import { agent as ask }` is
> seen and a local named `agent` is not. All nine Nexplore recipes are converted, and
> `npm run typecheck:recipes` gates the distribution's `npm test`: bodies typecheck, which was the
> whole point.
>
> **ONE body shape and ONE execution path.** A body is a module: imports, `meta`, then a
> default-exported async function. It runs in the vm, like every body always has.
>
> An earlier revision ran module-shaped bodies through a real `import()` and kept the vm for legacy
> ones. That was wrong in the one place it matters: `import()` cannot intercept
> `Date`/`Math.random`/`crypto.randomUUID`, so a resumed run re-read the live clock instead of
> replaying the journal — the opposite of "ambient nondeterminism is journaled, not banned". The vm is
> what makes that guarantee, so the vm is what stayed.
>
> The module shape needs nothing else from the loader, because the loader already blanks every import
> and injects the engine surface. It needs only a call to the default export
> (`findDefaultExportedFunctionName`; a default export that is not a named function is a load error
> that names the fix) plus the five value accessors on that same injected surface.
>
> This also dissolves the shape split previously documented here. Ephemeral agent-authored source is
> written under `.t3team-runs/<runId>/workflow.ts` in a workspace with no `node_modules`, so an import
> there used to be called unresolvable — but a blanked import never resolves at all, so it costs
> nothing, and the agent manual now teaches the same shape the repo uses.
>
> Legacy top-level-`return` bodies still EXECUTE unchanged: with no default export the loader appends
> no call and the IIFE runs top-to-bottom as before. That keeps the resume of any run suspended with a
> legacy-shaped source working (the engine re-reads that file on every resume) — the same
> replay-stability argument that keeps journal `refId` strings frozen across renames. What is gone is
> legacy AUTHORING, not legacy execution.

### LLM and orchestration

The author's LLM surface is the **Thread model** (see [§The thread model](#the-thread-model)):
`thread` / `spawnThread` / `agent`, plus the `Thread` verbs. `agent` is the one-shot shortcut;
there is **no** separate `agent.task` (deleted — "structured compute, no chat" is just
`await agent("…", { schema })`). The composition primitives below are unchanged.

| Import                   | Returns                       | Notes                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `getThread()`            | `Thread \| undefined`         | The chat the user launched from; `undefined` when headless (cron/automation). An accessor, not a binding — see [§How an imported verb finds its run](#how-an-imported-verb-finds-its-run).                                                                                                          |     |
| `spawnThread(opts?)`     | `Thread`                      | Create a new isolated thread; returns a `Thread` bound to it.                                                                                                                                                                                                                                       |
| `agent(prompt, opts?)`   | `Promise<string \| T>`        | One-shot shortcut for `spawnThread(opts).askAgent(prompt, opts)`. With `schema: Schema<T>`, returns a validated `T`; the thread is not retained.                                                                                                                                                    |
| `parallel(thunks)`       | `Promise<R[]>`                | Concurrent fanout with a barrier. Failing thunks resolve to `null`.                                                                                                                                                                                                                                 |
| `pipeline(items, …stgs)` | `Promise<R[]>`                | Per-item pipelined fanout — no barrier between stages.                                                                                                                                                                                                                                              |
| `workflow(ref, args?)`   | `Promise<O>`                  | Run another orchestration inline as a sub-step, in this run's own journal sequence. `ref` must be a typed `WorkflowRef` (no string form — declare refs via `defineWorkflow`). Any depth; recursion refused by name. See [§Sub-orchestrations are first class](#sub-orchestrations-are-first-class). |
| `phase(title)`           | `void`                        | Start a progress group. `title` is typed as the union of `meta.phases[].title` literals when `meta.phases` is declared `as const` (recommended). Calling with a title outside that union is a compile-time error.                                                                                   |
| `log(message)`           | `void`                        | Emit a narrator line above the progress tree.                                                                                                                                                                                                                                                       |
| `args`                   | `unknown`                     | The orchestration's input; validated against `meta.inputs` before the body runs.                                                                                                                                                                                                                    |
| `budget`                 | `{ total, spent, remaining }` | Token accumulator. Thread-turn token rollup is deferred (§Out of scope), so `spent()` currently reads 0.                                                                                                                                                                                            |

> **Black-box journaling boundary.** `parallel` and `pipeline` are each journaled as **one**
> entry; primitive calls made inside their thunks/stages are **not** individually journaled —
> the composition primitive itself is the journal boundary. On replay the recorded result is
> returned verbatim and the thunks (and any LLM/tool calls inside them) do **not** re-execute.
> Two consequences: (1) an author who needs fine-grained replay across N branches must refactor
> those branches into sequential sub-orchestrations; (2) token accounting is the top-level
> journaled calls only — work inside a `parallel`/`pipeline` thunk is invisible to the parent
> budget. Per-thunk journaling would require a deterministic event loop (the path Temporal
> takes) and is deferred.
>
> **`workflow()` is deliberately NOT in that list.** A sub-orchestration runs **inline, in the
> caller's own journal sequence**: its primitive calls take their own `seq`, exactly as if the
> author had written the child's body into the parent. That is what makes a sub-orchestration
> first class — see [§Sub-orchestrations are first class](#sub-orchestrations-are-first-class).
> The distinction is not stylistic: `parallel`/`pipeline` branches run _concurrently_, so their
> calls would interleave differently on replay and the journal would mismatch; a `workflow()`
> child is _sequential_, one at a time, in a deterministic order. Concurrency is the reason for
> the black box, not composition.
>
> A `workflow()` called from inside a `parallel` thunk or a `pipeline` stage is still inside that
> black box, with all the consequences above. Nesting a sub-orchestration under a concurrent
> primitive gives up its journaling; that is inherent, not an oversight.

### Sub-orchestrations are first class

> **Status: implemented.** A sub-orchestration lacks nothing a root body has.

An orchestration invoked with `workflow(ref, args)` is a real body, not a sealed side-quest:

| it can                                                    | because                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **durably suspend** on `askUser` and resume days later    | its ask writes a real `sent` entry in the run's journal, so the reply has somewhere to land after a restart                       |
| **reach the person who launched the run**, from any depth | the host passes `launchThreadId` straight down, so `getThread()` is the launching chat — not a nested context the user cannot see |
| **replay deterministically**                              | `now`/`random`/`uuid` are journaled at every depth, so a resume replays the recorded draw                                         |
| **resume part-way**                                       | its calls are individually journaled, so work already done is not redone                                                          |
| **nest further**                                          | there is no depth cap                                                                                                             |
| use `scripts.*`                                           | it shares the launching recipe's script tree                                                                                      |

The one thing it cannot do is **widen its authority**: `meta.capabilities` is intersected against
its immediate caller's, so authority only ever narrows going down.

Three constraints follow from the design, and none of them is a special case for children:

- **Recursion is refused**, by name, with the offending chain in the message. A recursive body
  cannot replay: each iteration writes entries at a `seq` that depends on how many iterations ran
  before it, so a resume re-entering with different data drifts. A loop in the caller's own body
  has no such problem and covers every case this shape would.
- **Editing a sub-orchestration's body shifts the caller's later `seq` values**, so a run already
  suspended against the old body will not line up. The engine fails loudly (`assertJournalMatch` /
  gap drift) rather than silently doing the wrong thing — the same contract that already governs
  editing a root body.
- **Under `parallel`/`pipeline`, a sub-orchestration is inside their black box** and gives up
  everything in the table above. That is inherent to concurrency, not a limitation of nesting.

> **History.** An earlier revision ran `workflow()` inside `runBlackBoxed` as one journal entry and
> capped nesting at one level — the cap existed only because a child was handed a primitive set with
> no sub-workflow executor. The cap was the visible symptom; the black box was the cause. Sealing a
> child meant its asks got an in-memory resolver (they died with the process), its `now`/`random`
> drew fresh values on replay, and the whole sub-run was replay-or-re-execute with nothing in
> between. Removing the black box for sequential sub-runs fixed all three, and made the depth cap
> pointless.

### The thread model

> **Status: implemented.** This is the author-facing interactive surface. Every verb reduces
> to the [Handle pattern](#the-handle-pattern)'s `sent`/`resolved` journal split — there is no
> separate suspension machinery.

An interactive conversation **is** the Handle pattern. There is one `Thread` type, shared by
the ambient launching thread and any spawned one:

```ts
interface Thread {
  askAgent<R>(prompt: string, opts?: { schema?: Schema<R>; model?: ModelSelection }): Promise<R>;
  notifyAgent(msg: string): void;
  askUser<R>(question: string, opts?: { schema?: Schema<R> }): Promise<R>;
  notifyUser(msg: string): void;
  readonly id: ThreadRef;
}
```

The globals bound into the body:

| Import               | Returns               | Purpose                                                                                                |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `thread`             | `Thread \| undefined` | The thread the orchestration runs in (the launching chat); `undefined` if headless.                    |
| `spawnThread(opts?)` | `Thread`              | A new isolated thread (`{ name?, model? }`).                                                           |
| `agent(prompt, o?)`  | `Promise<R>`          | Shortcut for `spawnThread(o).askAgent(prompt, o)` — returns the result for one-shots; thread not kept. |

The surface is a **2×2** of recipient (Agent / User) × mode (ask = drive + await a reply /
notify = fire-and-forget):

- `askAgent` / `askUser` return `Promise<R>` **directly** — `R` is the schema type, or `string`
  when no schema is given. There is no separate Conversation / `.result()` type.
- `notifyAgent` / `notifyUser` are fire-and-forget (`void`): one journaled `sent` entry, no
  reply, no suspend.
- A `schema` declared at the call is enforced by an internal corrective-retry loop (it re-asks
  on a mismatch, then throws `SchemaExhaustedError`) — the body sees a validated value or a throw.

```ts
const verdict = await agent("classify this", { schema: Verdict }); // one-shot, isolated thread
const t = spawnThread({ name: "Risk" });
const risk = await t.askAgent("analyze", { schema: RiskSchema }); // multi-turn on a spawned thread
t.notifyAgent("user prefers terse output");
await thread.askAgent("respond to their question"); // interactive, in the launching thread
const ok = await thread.askUser("approve?", { schema: Approve }); // typed user escalation
```

Each verb maps onto orchestration via the host broker: `spawnThread` → `thread.create`,
`askAgent`/`agent` → `thread.turn.start` (resolved on turn-done), `notifyAgent`/`notifyUser`
→ `thread.message.upsert` (one-way), `askUser` → a system message requesting input (resolved
on the user's reply). See [§Agents vs. orchestrations](#agents-vs-orchestrations).

### Other primitives — durable timers and journaled side effects

| Import                       | Returns         | Notes                                                                                                                                  |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts.<name>(args)`       | `Promise<T>`    | Call a recipe-registered script (typed). Result is journaled. See [§Scripts](#scripts). Gated by the `"script"` engine capability.     |
| `tools.<group>.<name>(args)` | `Promise<T>`    | Call a broker tool. ToolRefs are typed; the ref's group is checked against `meta.capabilities` at the call site. See [§Tools](#tools). |
| `wait(durationMs)`           | `Promise<void>` | Durable timer — suspends the orchestration if the deadline hasn't passed. Survives server restart.                                     |
| `Math.random()`              | `number`        | Deterministic `[0, 1)` — journaled. Call it as in any JS; a resume replays the recorded draw.                                          |
| `Date.now()`, `new Date()`   | `number`/`Date` | Deterministic wall-clock — journaled. A resume replays the recorded epoch millis.                                                      |
| `crypto.randomUUID()`        | `string`        | Deterministic UUIDv4 — journaled. A resume replays the recorded id.                                                                    |

`script` and `tool` may take arbitrary wall-clock time but don't durably suspend — they
block on a Promise that the engine awaits and journals when it resolves. `wait` is the
only non-Handle primitive that can suspend the orchestration durably across a server restart.

### Read-only ambient

| Import         | What it is                                                                         |
| -------------- | ---------------------------------------------------------------------------------- |
| `context`      | The reactive Queryable surface from Epic 16 — `context.activeWorkItem`, etc.       |
| `views`        | View component refs imported from the owning recipe, addressable by id.            |
| `cancellation` | A global `AbortSignal` for cooperative cancellation; pass into long-running calls. |

### Error classes (also globals, also catchable)

```ts
class WorkflowError extends Error {}
class TimeoutError extends WorkflowError {}
class SchemaExhaustedError extends WorkflowError {}
class ProviderUnavailableError extends WorkflowError {}
class PermissionDeniedError extends WorkflowError {}
class TargetMissingError extends WorkflowError {}
class CancelledError extends WorkflowError {}
class ReplayDriftError extends WorkflowError {}
```

The engine classifies every primitive failure into exactly one of these. Authors use
`instanceof` for branching. Anything outside the taxonomy is an engine bug.

## The Handle pattern

> **Status: implemented.** The pending/resolved journal split, deterministic `correlationId`
> derivation, and durable suspension are live in `@t3team/sdk` (`t3team-sdk.handles.ts`). The
> [Thread model](#the-thread-model) verbs are the author-facing surface; the Handle pattern is
> the internal mechanism they reduce to.

Every thread verb that awaits a reply (`askAgent` / `agent` / `askUser`) splits into **two**
journal entries, because the reply is a separate event that may arrive after a suspend/resume:

- a `"sent"` entry — written when the verb fires; carries a deterministic `correlationId`
  (`"<runId>:<seq>"` of the sent entry, so a replay re-derives it identically) and **no** result;
- a `"resolved"` entry — written when the reply settles, keyed by that `correlationId` (not by
  `seq`, because it lands out of band via the host).

When the body awaits a reply and no resolved entry exists yet, the run **durably suspends**:
`startWorkflow` / `resumeWorkflow` return a `SuspendedResult` instead of a `WorkflowRunResult`.
The host parks the run and, when the reply lands (a turn completes, or the user replies), calls
`appendResolvedEntry(runId, correlationId, reply)` + `resumeWorkflow`, which replays to the same
await and continues. On replay a journaled `sent` entry is **not** re-fired into the host.

Fire-and-forget verbs (`notifyAgent` / `notifyUser`, and `spawnThread`'s `thread.create`) write
**only** a `sent` entry — journaled synchronously so seq alignment survives a later suspend —
and never resolve or suspend. `spawnThread` returns the `sent` entry's `correlationId` as the
new thread's stable id.

The engine fires through an injected `MessageBroker` (the host delivery seam) and journals the
reply; real turn execution and view rendering (Epic 19) live in the host, not the engine.

## The determinism contract — replay safety

> **This is the most important section of this doc.** The engine replays the orchestration
> body from the top on every resume. Authors who break determinism break replay; the
> engine catches what it can but cannot catch everything.

### How replay works

Every journaled primitive call writes one line to an append-only
`.t3team-runs/<run-id>/journal.jsonl`:
`{ seq, callId, kind, refId, argsHash, result?, startedAt, endedAt }`. `kind` is one of
`"tool" | "script" | "script-never"` in 25.2 (the union widens as 25.3+ primitives are
journaled), `result` is a value/void envelope that is absent for `script-never` markers
(see below). On resume:

1. The engine re-runs the orchestration body from the top.
2. A per-run **sequence counter** increments on every primitive call; the call at counter
   value `seq` is matched against the journal entry recorded at that same `seq`.
3. **Matched** (same `kind`, `refId`, and `argsHash`): return the recorded `result`
   (re-validated against the current result schema) without re-executing.
4. **Not journaled yet** (`seq` past the recorded frontier): run the primitive live,
   append a journal entry, return it.
5. **Mismatched:** throw `ReplayDriftError` citing `seq` plus the expected-vs-observed
   `(kind, refId)` (call-identity drift) or `argsHash` prefixes (argument drift). A `seq`
   at or below the recorded frontier with no entry (a _gap_) is also drift.

A `replay: "never"` script always re-executes, but it still writes a typed
`script-never` **marker** (no `result`) so it occupies its `seq`. Removing or reordering a
never-script therefore surfaces as `ReplayDriftError` at the next call, rather than
silently re-executing a neighbouring journaled primitive. The orchestration inputs are hashed
into a sibling `runMeta.json` at start; resuming with different args is caught at that
input boundary (drift at `seq 0`) before the body re-runs.

`callId` is `"<seq>:<kind>:<refId>"` — derived from the **runtime sequence counter plus a
type tag**, not from lexical position. (Lexical position via stack-trace parsing is too
fragile under transpilation, bundling, and minification to be the durable key; the
sequence-counter idiom is what Temporal/Restate use.) The type tag is the drift guard:
**adding, removing, or reordering primitive calls is an orchestration-version-incompatible
change**, because every call after the edit shifts to a `seq` whose recorded `(kind, refId)`
no longer matches — surfacing as a loud `ReplayDriftError` rather than a silent wrong
replay. The one residual blind spot is reordering two calls that share the _same_
`(kind, refId)`: the type tag can't tell them apart, so only a differing `argsHash` would
catch it. Authors get correctness by keeping the call sequence stable across versions.

### Rules authors must follow

**1. Ambient nondeterminism is journaled, not banned.** Orchestration bodies see deterministic
`Date` (`Date.now()` / `new Date()`), `Math.random`, and `crypto.randomUUID` — call them
exactly as you would in any JS code. The engine journals each call, so on replay they
return the recorded value instead of re-reading the clock or drawing fresh entropy. For a
durable timer use `wait(ms)` (it suspends across a server restart, which a raw `setTimeout`
cannot); for network or filesystem I/O, call it from inside a `script` module rather than
inline, so the result is journaled. Stage-1 does **not** refuse an orchestration for reading
ambient state — it trusts project code (see [§Sandboxing](#sandboxing)).

**2. Imports are types-only.** Runtime imports change the module graph on replay — if a
dependency's behavior changes between original run and resume, replay diverges. Use
`import type { … }` for types in `.workflow.ts` files. The loader blanks every import
statement unconditionally — it makes no allow/deny decision — and injects `Schema` as a
global, so `import { Schema } from "effect"` works while any other runtime import resolves
to nothing in the body. The linter flags non-type imports so the gap surfaces early.

**3. Schema decode at top.** `const input = Schema.decodeSync(Inputs)(args)` runs once,
deterministically, before any primitive calls. Don't decode lazily; don't decode in a
branch.

**4. Pure code between primitive calls.** Computation between `await agent(...)` and the
next primitive call must be deterministic given the prior journaled results. If you
branch on `Date.now() > someThreshold`, that's fine (`Date.now()` is journaled). If you
branch on a closure over a mutable outer variable, you'll diverge.

**5. Script handlers must be deterministic OR pinned.** The engine journals every
`scripts.<name>(args)` call's return value, so on replay you get the recorded result.
But if the _original_ run had a non-deterministic script (e.g. `fetch` from a 3rd-party
API that returns different data on each call), the recorded value is correct for replay
— what's wrong is making _decisions_ based on the assumption that re-running the script
would produce the same result. Authors should treat all `scripts.<name>(...)` results as
journaled facts, not re-derivable values.

For scripts that intentionally must run fresh (no replay), declare them with
`defineScript({ replay: "never", … })` — those calls are excluded from the journal and
always re-run on resume. Use sparingly; a `replay: "never"` call breaks replay
determinism for everything downstream of it.

### What the engine catches automatically

| Detected                                                                                         | When                      | Effect                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------ |
| Non-type runtime imports                                                                         | Lint                      | Flagged; the loader blanks the import (value is `undefined` in the body) |
| Module-level mutable state                                                                       | Lint                      | Flagged by the linter                                                    |
| `meta` referencing non-extractable values                                                        | Orchestration load time   | Orchestration refuses to load                                            |
| Mismatched `argsHash` on replay (including a journaled `Date`/`Math.random`/`uuid` call)         | Replay execution          | `ReplayDriftError` at the diverging site                                 |
| Primitive call after `cancellation` aborted                                                      | Runtime                   | `CancelledError`                                                         |
| Capability mismatch (call site references a tool whose `group` ref isn't in `meta.capabilities`) | Runtime, at the call site | `PermissionDeniedError` thrown and journaled                             |

### What the engine cannot catch

| Not detected                                          | Mitigation                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Branching on closure over a mutable outer variable    | Lint heuristic + determinism contract in docs                                                    |
| `script` modules that read from non-journaled sources | Documented contract; reviewer eye                                                                |
| Non-deterministic order in `parallel` callbacks       | The engine journals each thunk's result in input order; order-of-completion is not part of state |
| Hoisted top-level `var` that's later reassigned       | Lint refuses module-level `let`/`var`                                                            |

Authors who follow the rules get correctness for free. Authors who break them get loud,
specific errors at the boundary that broke (e.g. `ReplayDriftError` cites the file, line,
and a side-by-side hash of expected vs. observed args).

### Sandboxing

Stage-1 has **no sandbox**. Orchestration bodies run in a `vm.Script` context with deterministic
`Date`/`Math.random`/`crypto.randomUUID` bound (each call journaled, so replays return the
recorded value), but the host realm is reachable via prototype chains. The trust model is
**"trusted project code"** — the same status as project recipes and scripts (see [Epic 16
§Security: Two Stages](./16-action-recipes.md#security-two-stages)). There is no banned-globals
scan and no AST refusal; the loader only blanks imports and lifts `meta`. Stage-2 (planned:
SES or `isolated-vm`) is the real sandbox if and when untrusted orchestrations come into scope —
until then the engine relies on the determinism contract above, not on isolation, for replay
safety.

## Capability gating

> **Status: partially implemented.** The user-escalation verbs are capability-gated: a
> orchestration whose `meta.capabilities` omits `"user"` gets `thread.askUser` / `thread.notifyUser`
> bound to throwers that raise `PermissionDeniedError` at the call site. `agent` / `spawnThread`
> / `askAgent` / `notifyAgent` are unconditionally bound (spawning isolated compute is core, as
> `agent` always was). The remaining gates (`scripts.*` ← `"script"`, tool-group refs for
> `tools.*`, the load-time/pre-execution permission UI, and nested-orchestration capability
> intersection) are deferred (static capability lint is out of scope this phase — the runtime
> gate is the backstop).

`meta.capabilities` is a declarative allowlist that gates which globals are bound at
orchestration-body-load time. An orchestration that doesn't declare `"script"` has `script` as
`undefined` — calling it is an immediate `PermissionDeniedError` at the call site.

```ts
import { Schema } from "effect";
import { githubRead, releaseNotesWrite } from "@t3team/sdk/groups";

export const meta = {
  name: "release-notes-from-pr",
  capabilities: [
    "thread", // thread.send + handle responses
    "child", // child.spawn
    "user", // user.ask + user.notify
    "script", // scripts.*
    githubRead, // tool group ref (typed)
    releaseNotesWrite, // tool group ref (typed)
  ],
  // …
};
```

The capability list is a mixed array of two kinds of entries:

**Engine feature strings** — closed set, defined by the engine, won't grow project-locally:

| String       | Unlocks                                       |
| ------------ | --------------------------------------------- |
| `"thread"`   | `thread.send`                                 |
| `"child"`    | `child.spawn`                                 |
| `"user"`     | `user.ask`, `user.notify`                     |
| `"script"`   | `scripts.*` — the recipe's registered scripts |
| `"ui"`       | `ui.show` (auto-granted if recipe has views)  |
| `"workflow"` | `workflow()` (sub-orchestration invocation)   |

**`ToolGroupRef`s** — typed references to tool groups declared via `defineToolGroup` (see
[§Tools](#tools)). Each ref unlocks every tool registered under that group. Built-in
groups ship in `@t3team/sdk/groups`; project-local groups live in `.t3team/groups.ts` or
the recipe.

TypeScript types `meta.capabilities` as `(EngineCapability | ToolGroupRef)[]` — wrong
feature strings caught at compile time; wrong group refs caught at compile time. The
loader extracts the array from `meta` and binds globals accordingly.

Globals not listed in either category — `agent`, `spawnThread`, `thread` (and its agent-side
verbs), `parallel`, `pipeline`, `phase`, `log`, `args`, `budget`, `wait`, `random`, `now`,
`uuid`, `context`, `views`, `cancellation`, and the error classes — are **unconditionally
bound**. They have no capability gate because their effects are either contained to the
orchestration run (timers, journaled values), spawn isolated compute (`agent` / `spawnThread` /
`askAgent`), or are read-only. Only the user-escalation verbs (`askUser` / `notifyUser`) are
gated, by `"user"`.

Capabilities surface in the **pre-execution permission UI** the user sees before any
orchestration with elevated capabilities runs. The UI reads each group ref's `label` and
`description` for human-friendly text; engine feature strings render via the engine's
own label table. This is the one place declarative JSON beats TS-as-config — the user
needs to see the request _before_ executing the code that would ask for it.

Nested orchestrations can declare a subset of the parent's capabilities but never a superset.
The check runs against the **immediate** caller, not the root, so capabilities narrow monotonically
down a chain of any depth: a grandchild cannot recover something its parent gave up.
The engine intersects at invocation.

## Tools

Tools are the t3team capability surface — the verbs that read or mutate external state
(GitHub, Jira, the filesystem, the workspace). Orchestrations call them; views call them
indirectly through orchestrations. They are owned and dispatched by `T3TeamToolBroker` (see
[Epic 16 §Tools](./16-action-recipes.md#tools)) but in the Epic 25 engine they appear in
orchestration bodies as **typed, namespaced callables** — never as strings.

### `defineTool` — declaration + implementation in one place

```ts
// @t3team/sdk/tools/github.ts — default-pack tool example
import { Schema } from "effect";
import { githubWrite } from "@t3team/sdk/groups";

export const mergePullRequest = defineTool({
  id: "github.pull_request.merge", // broker dispatch key
  group: githubWrite, // capability classification (typed ref)
  args: Schema.Struct({
    id: Schema.String,
    adminOverride: Schema.optional(Schema.Boolean),
  }),
  result: Schema.Struct({ sha: Schema.String }),
  handler: async (args, ctx) => {
    const result = await ctx.github.pulls.merge({ pull_number: args.id /* … */ });
    ctx.log.info("merged", { sha: result.sha });
    return { sha: result.sha };
  },
});
//  ^ ToolRef<{ id: string; adminOverride?: boolean }, { sha: string }>
```

Project-local tools are authored the same way under `.t3team/recipes/<id>/tools/` or
`.t3team/tools/`. Declaration (`id` / `group` / `args` / `result`) and implementation
(`handler`) live in one file — no separate handler module.

### Tool groups — `defineToolGroup`

Groups classify tools for the user-facing permission UI. They are typed refs (not
strings) for consistency, just like tools and orchestrations:

```ts
// @t3team/sdk/groups.ts — built-in groups
export const githubRead = defineToolGroup({
  id: "github.read",
  label: "Read GitHub data",
  description: "View PRs, issues, branches, files. Cannot modify state.",
});
export const githubWrite = defineToolGroup({
  id: "github.write",
  label: "Modify GitHub",
  description: "Merge PRs, push branches, edit issues, dispatch workflows.",
});
//  ^ both are ToolGroupRef
```

The `id` is the unique string identifier (used for permission UI display, audit logs,
and as the broker-side classification). `label` and `description` are user-facing.
Group `id`s are globally unique within a project; the loader refuses duplicate
registrations with a clear error.

Groups live in pack-aware tiers, by ownership:

- **Core/distribution groups** in `@t3team/sdk/groups.ts` or an active distribution pack —
  covers tools the host or distribution ships (`githubRead`, `githubWrite`, `jiraRead`,
  `jiraWrite`, `t3teamThreadWrite`, etc.).
- **Pack-provided groups** from active packs. These are how enterprise or connector packs
  introduce new consent categories.
- **Project-local groups** in `.t3team/groups.ts`, registered via
  `defineProject({ groups: { … } })`. For project-wide novel consent semantics.
- **Recipe-scoped groups** declared inline in `recipe.ts` when only that recipe's tools
  use them.

### The `tools.*` global tree

Orchestration bodies call tools through a namespaced global — no imports needed for tools made
available by the resolved pack/project environment. The mapping from tool `id` to the
namespace path is mechanical:
`github.pull_request.merge` → `tools.github.pullRequest.merge` (dot segments become
nested objects; snake_case → camelCase per segment).

```ts
// inside a .workflow.ts body
const { sha } = await tools.github.pullRequest.merge({ id: input.prId });
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ToolRef, directly callable.
//                    Args + return are fully typed.
```

ToolRefs are directly callable — there's no separate `tool(ref, args)` dispatcher. The
ref's `group` is checked against `meta.capabilities` at the call site; missing
capability → `PermissionDeniedError` thrown synchronously and journaled like any other
primitive failure.

The SDK/pack loader emits ambient `.d.ts` files for the resolved tool tree so authors get
full IntelliSense without a project build step.

### Project-local tools via recipe registration

Project-local tools register on the recipe (or the project root) and appear in the
orchestration under a recipe- or project-scoped namespace:

```ts
// .t3team/recipes/pr-review/tools/customAnalyze.ts
export const customAnalyze = defineTool({
  id: "pr-review.custom_analyze",
  group: prReviewRead,
  args: Schema.Struct({ pr: PrSchema }),
  result: Schema.Struct({ score: Schema.Number, findings: Schema.Array(Schema.String) }),
  handler: async (args, ctx) => {
    // …local analysis logic…
    return { score, findings };
  },
});

// .t3team/recipes/pr-review/recipe.ts
import { customAnalyze } from "./tools/customAnalyze.ts";

export default defineRecipe({
  id: "pr-review",
  tools: { customAnalyze }, // makes tools.recipe.customAnalyze available
  // …
});
```

```ts
// inside any workflow of pr-review
const analysis = await tools.recipe.customAnalyze({ pr });
//                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ typed via the recipe's tools declaration
```

Project-level tools follow the same pattern from `.t3team/project.ts` and appear under
`tools.project.*`.

### `ToolHandlerCtx`

The handler's second argument is a typed context the broker injects per call:

```ts
type ToolHandlerCtx = {
  readonly threadId?:  string;        // present when called from a thread-bound workflow
  readonly runId?:     string;        // present when called inside a workflow run
  readonly workspaceRoot: string;

  log: { info(msg, fields?): void; warn(…); error(…); };
  fetch: typeof fetch;                // HTTP

  workspace: {                         // file IO rooted at the run dir (sandboxed by path)
    readText(rel: string):  Promise<string>;
    writeText(rel: string, content: string): Promise<void>;
    exists(rel: string):    Promise<boolean>;
  };

  callTool: <I, R>(ref: ToolRef<I, R>, args: I) => Promise<R>;   // typed cross-tool dispatch

  // Integration clients injected by the broker based on the tool's group:
  github?: GitHubClient;               // when group descends from github.*
  jira?:   JiraClient;                 // when group descends from jira.*
  // …
};
```

The handler is plain async TypeScript — no Effect ceremony required for authors, even
though the broker itself is an `Effect.Service` under the hood. Integration-specific
clients are injected based on the tool's `group` so the handler doesn't have to thread
credentials manually.

### Sandboxing — symmetric with orchestration bodies

- **Built-in tool handlers** (in `@t3team/sdk/tools/*.ts`) are host-trusted code, no
  sandbox.
- **Project-local tool handlers** are stage-1 trusted today (same status as project
  recipes and scripts — see [Epic 16 §Security: Two Stages](./16-action-recipes.md#security-two-stages)).
  Stage-1 has no sandbox for them, as for orchestration bodies (see [§Sandboxing](#sandboxing)). The
  planned Stage-2 VM-isolation work makes the handler's `ToolHandlerCtx` the only API surface,
  with ambient `fetch`/`fs`/`process` stripped from `globalThis`.

The handler ↔ orchestration-body sandboxing is deliberately symmetric: same stage-1 vs.
stage-2 plan, same injected-`ctx`-becomes-the-only-surface pattern. No new security
model needed for tools.

## Scripts

Scripts are the recipe-private cousin of tools: TS modules that take typed input and
return typed output, but **not** broker-registered, **not** capability-grouped, and
**not** addressable from other recipes. They are for recipe-internal utility work — fetch
a PR, parse a commit message, derive a release-notes section — that doesn't deserve a
broker-tool entry but does deserve type safety.

### `defineScript` — same shape as `defineTool`, minus the broker concerns

```ts
// .t3team/recipes/pr-review/scripts/fetchPr.ts
import { Schema } from "effect";

export const Inputs = Schema.Struct({ url: Schema.String });
export const Outputs = Schema.Struct({
  title: Schema.String,
  diff: Schema.String,
  base: Schema.String,
  head: Schema.String,
});

export default defineScript({
  inputs: Inputs,
  outputs: Outputs,
  handler: async (args, ctx) => {
    const res = await ctx.fetch(args.url);
    const body = await res.json();
    return { title: body.title, diff: body.diff, base: body.base, head: body.head };
  },
});
//  ^ ScriptRef<{ url: string }, { title: string; diff: string; base: string; head: string }>
```

No `id`, no `group` — scripts are scoped to the recipe that registers them; they have
no global identity. The `"script"` engine capability gates whether `scripts.*` is bound
at all, but it doesn't gate which scripts the orchestration can call (that's already limited
by recipe ownership).

### Recipe registration and the `scripts.*` global

```ts
// .t3team/recipes/pr-review/recipe.ts
import fetchPr from "./scripts/fetchPr.ts";
import parsePrTitle from "./scripts/parsePrTitle.ts";

export default defineRecipe({
  id: "pr-review",
  scripts: { fetchPr, parsePrTitle }, // makes scripts.fetchPr / scripts.parsePrTitle available
  // …
});
```

```ts
// inside a workflow of pr-review — no imports needed
const pr = await scripts.fetchPr({ url: input.prUrl });
const parsed = await scripts.parsePrTitle({ title: pr.title });
//             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ fully typed
```

The `scripts.*` global tree is built per-orchestration at load time from the launching
recipe's `scripts` registration. There is no project-level or global script tree — if
you need cross-recipe reuse, promote the script to a tool with a group.

### `ScriptHandlerCtx`

Strictly smaller than `ToolHandlerCtx` — no integration clients, no per-call `threadId`
beyond what the orchestration's run provides:

```ts
type ScriptHandlerCtx = {
  readonly runId:         string;
  readonly workspaceRoot: string;

  log:   { info(msg, fields?): void; warn(…); error(…); };
  fetch: typeof fetch;
  workspace: {
    readText(rel: string):  Promise<string>;
    writeText(rel: string, content: string): Promise<void>;
    exists(rel: string):    Promise<boolean>;
  };
  callTool: <I, R>(ref: ToolRef<I, R>, args: I) => Promise<R>;   // typed cross-tool dispatch
};
```

Scripts can call tools (`ctx.callTool`) so the line between "a tool that does
project-specific work" and "a script that uses host tools" is the registration shape,
not the capability.

### Sandboxing

Same stage-1 / stage-2 plan as tool handlers. The `ScriptHandlerCtx` becomes the only
API surface at stage 2.

## Recipes and orchestration references

A recipe imports orchestration types via type-only imports and registers them as typed refs:

```ts
// .t3team/recipes/pr-review/recipe.ts
import type * as StartReview from "./actions/start-review.workflow.ts";
import type * as ApproveAndMerge from "./actions/approve-and-merge.workflow.ts";
import type * as RequestChanges from "./actions/request-changes.workflow.ts";

export const startReview = defineWorkflow<typeof StartReview>("./actions/start-review.workflow.ts");
export const approveAndMerge = defineWorkflow<typeof ApproveAndMerge>(
  "./actions/approve-and-merge.workflow.ts",
);
export const requestChanges = defineWorkflow<typeof RequestChanges>(
  "./actions/request-changes.workflow.ts",
);

export default defineRecipe({
  id: "pr-review",
  applicability: {
    /* … */
  },
  surfaces: ["project.dashboard.myWork", "thread.context"],
  defaultAction: startReview, // typed binding
  sidecarSection: defineSidecarSection({
    /* … */
  }),
  conversationCard: defineConversationCard({
    /* … */
  }),
});
```

`defineWorkflow<typeof Module>("./path")` returns a `WorkflowRef<Inputs, Outputs>` whose
types are inferred from the file's exported `Inputs`/`Outputs` schemas via the type-only
import. The type-only import doesn't pull the orchestration body into the host module graph at
runtime — TypeScript strips it — so the body is loaded and run only in the engine's
`vm.Script` context at invocation time.

View code consumes orchestration refs by typed variable, with `host` injected as a prop:

```tsx
// .t3team/recipes/pr-review/views/PrItem.tsx
import { approveAndMerge, requestChanges } from "../recipe.ts";

export const PrItem = ({ pr, host }: PrItemProps) => (
  <div>
    <Button onClick={() => host.run(approveAndMerge, { prId: pr.id })}>Approve and merge</Button>
    <Button onClick={() => host.run(requestChanges, { prId: pr.id, reason: "…" })}>
      Request changes
    </Button>
  </div>
);
```

`host.run<I, O>(ref: WorkflowRef<I, O>, args: I): Promise<O>` is typed end-to-end. Wrong
args is a compile error. Missing fields is a compile error. The return type is the
orchestration's declared `Outputs`. For long-running orchestrations where the view needs a handle
(progress, cancellation), use `host.start(ref, args): RunHandle<O>` — same args, returns
a richer handle with `status$`, `cancel()`, and `.result: Promise<O>`.

There is no string-keyed action registry on the recipe; views fire orchestrations directly via
the imported ref. The recipe's `defaultAction` is the only binding the launcher needs
statically — it's what the Quick Starts card / `/<slashAlias>` selection runs.

Sub-orchestration invocation from inside another orchestration body uses the `workflow()` global
with a typed `WorkflowRef`:

```ts
// inside another .workflow.ts
import type * as Degraded from "./degraded.workflow.ts";
const degraded = defineWorkflow<typeof Degraded>("./degraded.workflow.ts");

// later in the body:
const result = await workflow(degraded, args); // typed
```

`workflow()` does not accept a string form. For dynamic dispatch, branch on the ref:
`const ref = condition ? workflowA : workflowB; await workflow(ref, args);`.

## Agents vs. orchestrations — the asymmetry

Agents and orchestrations live in different runtime worlds, deliberately. Agents are
**in-flight** — the LLM streams tokens to its provider in a single open connection;
suspending an agent mid-turn means killing and re-establishing that connection. Orchestrations
are **durable** — every primitive call is a journaled checkpoint; suspending an orchestration
parks it cheaply and resumes it on the next external event.

This asymmetry shapes the surface each side gets:

| Capability                                              | Agent                     | Orchestration              |
| ------------------------------------------------------- | ------------------------- | -------------------------- |
| Spawn a child thread                                    | ✅                        | ✅                         |
| Fire-and-forget message to another thread               | ✅                        | ✅                         |
| Receive messages from other threads                     | ✅ (inbound on next turn) | ✅ (via `Handle.response`) |
| Blocking ask with schema-typed response                 | ❌                        | ✅                         |
| Escalate to user and await typed reply                  | ❌                        | ✅                         |
| Branch on typed errors with try/catch                   | ❌                        | ✅                         |
| Compose multiple LLM calls with intermediate transforms | partial (in one turn)     | ✅                         |

Agents get the simplified, fire-and-forget surface (spawn a child thread, post a one-way
message). Anything more — a blocking request/response, suspend-and-resume, user escalation —
belongs in an orchestration, where the `Thread` verbs (`askAgent` / `askUser`) do the suspension via
the Handle pattern.

When an agent needs schema-typed output, it launches an orchestration that does the work and posts
the typed result back to the agent's thread on the next turn. The agent reads it as a normal
inbound message; the orchestration does the suspension.

## Implementation phasing

The step-union runtime has been **deleted** — the durable engine is the only orchestration runtime.

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                    | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 25.1  | `.workflow.ts` file loader + `meta` static extractor + `defineWorkflow` / `defineTool` / `defineToolGroup` / `defineScript` SDK + ambient `tools.*` / `scripts.*` trees + ambient types                                                                                                                                                                  | Implemented |
| 25.2  | Durable-execution engine: journal, replay, `argsHash`, `ReplayDriftError`                                                                                                                                                                                                                                                                                | Implemented |
| 25.3  | Composition primitives: `parallel`, `pipeline`, `phase`, `log`, `args`, `budget`, `workflow`; plus the journaled-value primitives `random`, `now`, `uuid`, `wait`, and the `script` / `tool` invocation primitives                                                                                                                                       | Implemented |
| 25.4  | Handle pattern: the `sent`/`resolved` journal split, deterministic `correlationId`, durable suspension (`SuspendedResult`), and the `MessageBroker` host seam                                                                                                                                                                                            | Implemented |
| 25.x  | **Thread model + host wiring + legacy deletion:** `thread`/`spawnThread`/`agent` + the `Thread` verbs over the Handle pattern; the orchestration-backed broker, the launch path (`startWorkflow`), and the resume reactor (turn-done / user-reply → `appendResolvedEntry` + `resumeWorkflow`); the step-union runtime, its routes, and its tests removed | Implemented |
| 25.x  | **DB-backed durability:** the `JournalStore` seam (default `FsJournalStore`), the server's SQLite store (`workflow_journal`) + `WorkflowRunRepository` (`workflow_runs`), launch/broker write-through, and boot rehydration of suspended runs (§Open question 2). The in-memory registry is now a hot index over a durable DB source of truth            | Implemented |
| 25.5  | Determinism enforcement: lint rules flagging nondeterminism patterns, capability gating at load time                                                                                                                                                                                                                                                     | Planned     |

Every recipe is authored against the engine (`recipe.ts` + `*.workflow.ts`); there is no
longer a `recipe.json` / step-union path.

## Pre-run review phase (design intent — PJ, 2026-08-29, not built)

The engine already has a **reactive** repair path: `t3team-workflowSelfHeal.ts`,
`t3team-workflowEngineRepair.ts`, and `t3team-workflowRepair{Generate,Guardrails,Policy,Prompt}.ts`,
with a distribution-tunable `t3team-pack-workflowRepairPolicy.ts`. It fires *after* a run fails,
hands a no-tools structured repair model the failure plus `T3TEAM_WORKFLOW_MANUAL`, and retries.

The intent is a **proactive** counterpart that reuses the same machinery:

- The workflow builder should itself be a subagent, at least in part.
- Before a workflow is accepted for its first execution, a **review phase** checks the authored
  source against a ruleset.
- That review runs on a **cheap tier** (`Instant` or `Fast`) — it is a fast conformance check, not
  a reasoning task.
- On rejection it feeds the existing repair loop rather than failing the run.

Why this is worth having, from live QA on 2026-08-29: `precheckWorkflowSource`
(`t3team-workflowSourcePrecheck.ts`) is the only gate today, it runs **only** for inline `source`
(never for `workflowPath`), and it checks exactly two things — that `export const meta` is present
and that the TypeScript parses. A file carrying `import { readFileSync } from "node:fs"`, a `meta`
declared *after* the default export, and an `agent()` call with no `capabilities` passed both
checks and died at runtime with a bare `ReferenceError: readFileSync is not defined`. Each of those
violates a rule the manual states explicitly, and none is cheaply expressible as a static check —
which is exactly the shape a cheap-model conformance pass handles well.

## Self-build from prompt, not only self-repair (design intent — PJ, 2026-08-29, not built)

Extends the pre-run review phase above. Today an orchestration is authored *inline* by the calling
agent and the engine only ever repairs it reactively. The intent is that the builder can also
**self-build from a prompt**, the same way `widget.show` should (Epic 24 § Widget composition
default).

**Advantage** — less context rot in the orchestrator thread: the calling agent describes the
structure it wants instead of emitting 60–110 lines of TypeScript into its own context.

**Risk, stated by PJ** — vision drift: the full idea may not survive the prompt lens.

**Mitigation that already exists.** `t3team.orchestration.run` already *requires*
`intent: { goal, expectedOutcome, guardrails }` — non-blank goal and expectedOutcome, at least one
non-blank guardrail (`packages/t3team-sdk/src/tools/t3team-sdk.workflow.ts`). That is already a
structured contract for carrying intent through a lens, rather than free prose, and a prompt-built
workflow would inherit it unchanged.

**Refinement must not be a rebuild — and the seam is already there.** Two existing mechanisms:

- `t3team.orchestration.resume` accepts a corrected `source` and performs same-prefix journal
  replay: journaled steps return their recorded results verbatim, execution continues live past the
  recorded frontier (`t3team-toolBrokerWorkflowResumeTool.ts`, `t3team-workflowResumeFailed.ts`).
- The authored source persists at `.t3team-runs/<runId>/workflow.ts` and the engine re-reads it on
  every resume/rehydrate, so a builder can read the current source and amend it rather than
  regenerate from scratch.

So the target shape is tri-modal, mirroring `showWidget`: `prompt` (default, builder subagent),
`source` (raw, deterministic — required inside orchestration bodies), `workflowPath` (existing file).

**Evidence for keeping the raw path (live QA, 2026-08-29).** Authoring with full conversation
context produced materially better sources than a summary could: the agent embedded the exact file
contents under review, and in another run the literal sentinel string the user had asked for
(`TIMER-FIRED-OK`). Both would plausibly be lost through a summarising prompt lens — which is the
concrete form the drift risk takes.

## Open questions

1. **VM isolation strategy.** Stage 1 trusts project code (current). Stage 2 needs real
   sandboxing — likely via `node:vm` + a frozen-realm pattern, or a worker thread with a
   tightly typed message channel. Decide before phase 25.2 ships.
2. **Journal storage. — RESOLVED (DB-backed durability).** The engine no longer reaches the
   filesystem directly: it reads + appends through a pluggable **`JournalStore`** seam
   (`appendEntry` / `appendResolved` / `readEntries` / `readRunMeta` / `writeRunMeta`, plus
   `hasRun` / `clear` / `locator`). The SDK default is `FsJournalStore`
   (`.t3team-runs/<run-id>/journal.jsonl` + sibling `runMeta.json`, dotted + gitignored), so
   standalone use and the SDK suite are unchanged. The synchronous body primitives
   (`now`/`random`/`uuid`, one-way `thread.create`/`thread.message`) journal through a
   `createStoreSink` buffer that appends synchronously and exposes an async `flush()` the engine
   awaits at the suspend/complete boundary — the single durability barrier.

   The **server injects a SQLite-backed store** (`workflow_journal`, one row per wire entry; a
   `resolved` reply reuses its matching `sent` entry's `seq` so the `(run_id, seq, phase)` PK
   stays unique) alongside a **`WorkflowRunRepository`** (`workflow_runs`: the run record +
   pending ask). Both share **one** durability guarantee — the journal and the run record commit
   to the same DB, so there is no split-brain where the DB says "resume" but the journal is gone.
   On boot, `rehydrateSuspendedWorkflowRuns` reads `workflow_runs WHERE status='suspended'` and
   rebuilds each run's resume closure: DATA (orchestration path, args, project/model/mode, pending
   ask) from the row, CODE (broker, dispatch, store, registry, lifecycle) reconstructed from host
   layers, then `registry.registerRun` + restore the pending ask. The reactor then resolves it
   identically whether the ask was set this uptime or a prior one. Journal compaction/retention
   for completed runs, and multi-instance locking, remain future work (single-instance assumed).

   `rehydrateSuspendedWorkflowRuns` is wired into server boot via
   `T3TeamWorkflowEngineRehydrateLive`, sequenced after the reactor layer, in both
   `apps/server/src/server.ts` and `apps/server/src/t3team-server.ts`.

3. **Per-call model selection for cost discipline.** When `meta.model` declares a default and
   a single `agent` / `askAgent` call wants a cheaper model, the per-call `model:` override
   should be a strict subset of the orchestration's declared capability for that provider. Surface
   the rule in the lint.
4. **Cancellation semantics for spawned-thread orphans.** When a parent orchestration throws without
   resolving a spawned thread's pending turn, does the engine cascade-cancel the child? Default
   proposal: yes, on parent failure or cancellation, propagate `CancelledError` to all open
   pending asks via `thread.cancelled` system messages.
5. **`view.update` schema-change semantics.** A `ui.show`-style update for a handle with a
   response schema must take a `View<SameR>` — different response types require a new
   `show` + new handle. The lint enforces this; the type system also catches it.

## References

- [Epic 16: Action Recipes](./16-action-recipes.md) — recipe shape, discovery, surfaces,
  applicability, kickoff UX.
- [Epic 19: Workspace Miniapps](./19-workspace-miniapps.md) — View placements and the
  miniapp contract that `ui.show` renders against.
- [Epic 21: Context & Tool Catalog](./21-context-tool-catalog.md) — tool groups for
  capability gating via `ToolGroupRef`s in `meta.capabilities`.
- [Epic 24: Tiered Message Composition](./24-tiered-message-composition.md) — system
  message envelope and the three-author conversation model that orchestration messages slot
  into.
- The Claude Code `Workflow` tool — the inspiration; this engine extends it with
  arbitrary script execution, child sessions, cross-thread messaging, user escalation,
  and capability gating.
