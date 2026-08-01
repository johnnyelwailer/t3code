# Reusable Runbook Engine

Status: architecture and implementation track.

The runbook engine is the durable execution system currently embedded in T3Code/T3Team. This branch is intended to both extract that engine and build the reusable implementation around it. Its distinctive authoring model is ordinary TypeScript: an author writes a `.workflow.ts` module with top-level `await`, imports the typed SDK surfaces that are needed, and lets the engine journal primitive boundaries so the module can be replayed after a pause or failure.

The goal is to make that engine reusable without changing the existing workflow authoring model or introducing a generic dispatcher API. The engine should be portable across hosts; individual workflows do not need to be portable across hosts, and may depend on the tool surface available in their environment. Existing code should continue to write APIs such as:

```ts
const review = await agent("Review this change", { schema: ReviewSchema });
const pr = await tools.github.pullRequest.get({ id: input.prId });
const parsed = await scripts.parsePrTitle({ title: pr.title });
const approval = await thread.askUser("Merge this pull request?", { schema: Approval });
await waitUntil(deadline);
```

The reusable boundary is below those APIs: journaling, replay, handles, suspension, typed references, dispatch, persistence, and host integration.

## Capability tiers

`agent` is a tool in the broad sense that it is a typed, durable capability. It is also important enough to deserve a first-class optional package. It should not be put in the minimal durable core, and it should not be treated as just another application catalog entry.

`spawnThread` and the `Thread` surface are a different case: they express the T3Code/T3Team conversation and orchestration model, so they belong in the T3Code/T3Team adapter or an optional host-specific agent package.

| Tier | Examples | Ownership |
| --- | --- | --- |
| Engine primitives | `waitUntil`, `now`, `parallel`, `pipeline`, `workflow`, `phase`, `log` | Runbook core |
| Agent primitive | `agent` | Optional `@runbook/agent` package; provider adapter supplies execution |
| Host conversation surface | `spawnThread`, `thread.askAgent`, `thread.askUser`, `thread.notifyUser` | T3Code/T3Team adapter or another host-specific package |
| Application tool catalogs | `tools.github.*`, `tools.jira.*`, filesystem, browser, cloud APIs | Optional catalog packages and host bindings |
| User-authored scripts | `scripts.*`, `defineScript` | Optional `@runbook/scripts` package |
| Models and providers | `defineModel`, provider/model selection, agent turn execution | Provider packages and host adapters |

All tiers use the same durable primitive and replay machinery. They should not all be flattened into one global catalog: the built-in agent/thread surface has lifecycle and suspension semantics that ordinary application tools do not.

## Package shape

The first extraction should use a small number of deliberate package boundaries. Internal modules can be split further once their contracts are proven.

```text
@runbook/core
  Durable runtime, replay, journal coordination, handles,
  suspension, deterministic primitives, runtime ports, and
  generic contracts such as ToolRef, ScriptRef, WorkflowRef,
  ModelRef, journal entries, and handles.

@runbook/agent
  Optional first-class agent primitive: typed prompts and replies,
  model/provider selection, durable agent-turn semantics, and
  an adapter interface for custom agent providers.

@runbook/scripts
  User-authored arbitrary TypeScript extension code:
  ScriptRef, defineScript, script registries, execution context,
  replay policy, and pluggable script executors.

@runbook/ts
  The existing .workflow.ts loader, static metadata extraction,
  ambient typed trees, TypeScript authoring surface, and determinism checks.

@runbook/effect
  Effect-native layers, services, schema helpers, and adapters.

@runbook/catalog-*
  Optional typed capability catalogs: GitHub, Jira, browser,
  filesystem, cloud APIs, or application-specific tools.

@runbook/t3code-adapter
  Compatibility integration for the current T3Code/T3Team host:
  broker, persistence, models, threads, `spawnThread`, workspace,
  server lifecycle, scheduler, and existing permission behavior.

@t3team/sdk
  Existing compatibility facade, initially re-exporting the extracted surface.
```

The generic packages must not import T3Team domain types, server services, database implementations, or a particular provider. The T3Code/T3Team adapter may depend on all of those. In particular, `@runbook/core` must not assume that a workflow has threads, chat, or even an agent provider installed.

`@runbook/core` may own the generic contracts; they do not need a separate package initially. A contract belongs in core when it describes reusable execution semantics or a host-neutral typed capability. T3Code-specific handler contexts, clients, thread objects, and server services belong in the adapter.

The adapter name is intentionally still provisional. The important boundary is that the generic package is not named after either product.

## Catalogs, bindings, and runtime adapters

These are three different extension points:

1. A **catalog** declares a typed application capability: its stable ID, namespace, input and output schemas, capability group, documentation, and author-facing reference.
2. A **binding** supplies an implementation: an API client, credential resolver, transport, retry policy, or host-specific handler context.
3. A **runtime adapter** supplies durability: journaling, replay, wakeups, leases, queues, and run ownership.

The optional agent package is adjacent to this model. It defines the generic agent-turn capability and provider contract, while a host-specific package may add richer concepts such as T3Code's threads and spawned conversations.

## Scripts and tools

Scripts and tools are intentionally different extension mechanisms:

| | Scripts | Tools |
| --- | --- | --- |
| Primary purpose | Let a project add arbitrary TypeScript behavior | Expose a host or integration capability |
| Typical owner | Runbook author, recipe, or project | Host, integration pack, or application |
| Example | Parse a PR, inspect a workspace, combine results, apply custom logic | GitHub merge, Jira search, browser action |
| Surface | `scripts.<name>(args)` | `tools.<group>.<name>(args)` |
| Core concern | Code execution policy and replay boundary | Capability, permissions, and host dispatch |

For the target use case—an asynchronous distributed agent system that reviews PRs or Jira tickets—the project can be configured by adding TypeScript runbooks and scripts:

```text
workflow body
  ├── scripts.*       project-specific analysis and decision logic
  ├── tools.*         host/integration actions
  ├── agent(...)      model-backed reasoning
  └── wait/handles    durable pauses and external replies
```

This does not require a universal tool catalog or portable workflow source. Each deployment can define the tools it needs, while the runbook engine and script execution package remain reusable.

The current engine treats a script call as an asynchronous but atomic primitive: its final result is journaled, but the script itself does not create an independent durable suspension point. That behavior should remain unchanged during extraction unless we deliberately add nested durable script execution.

## Child workflows

Workflow composition has two distinct forms:

```text
inline composition
  parent awaits workflow(ref, args)
  child body is a black-box sub-step
  parent receives one result

spawned child workflow
  parent starts an independent durable run
  child receives its own run ID and journal
  parent may await it, continue without it, or outlive it
```

The existing `workflow(ref, args)` primitive is the first form and must remain unchanged during extraction. The repository also has a host-level `runWorkflow(...)` launch path. Before introducing any new child-workflow API, the implementation work should inventory those existing surfaces and preserve their actual semantics. A PR-review workflow may already be able to launch analysis, test, or remediation work through that host path.

Child workflow semantics belong to the runbook orchestration model rather than to a T3Code-specific tool catalog. The host adapter supplies child-run persistence, launch, resume, and lifecycle operations.

For example:

```text
@runbook/catalog-github
  typed GitHub ToolRefs, schemas, and capability groups

@runbook/binding-github-octokit
  implementations using Octokit and a credential provider

@runbook/t3code-adapter
  durable dispatch through the current T3Code broker
```

Catalogs may optionally be split by domain and permission boundary when an application wants to distribute or reuse them:

```text
@runbook/catalog-github-core
@runbook/catalog-github-read
@runbook/catalog-github-write
@runbook/catalog-jira-read
@runbook/catalog-jira-write
@runbook/catalog-t3team
```

An application composes only the catalogs it wants. Composition must detect duplicate IDs, namespace collisions, incompatible schemas, and missing capability-group definitions. Catalog selection should be scoped to a host/project/recipe environment rather than one universal process-global catalog.

This is not required for workflow portability. A workflow may depend on a host-specific tool surface, and another environment may define a completely different set of tools. Only the durable engine and its runtime contracts are intended to be reusable across hosts.

For v1, existing `defineTool` declarations can continue to contain their handler, preserving the current contract. Contract-only catalogs and separate bindings should be possible later without forcing a migration during extraction.

## Effect boundary

Effect is a fitting implementation technology for the runtime: cancellation, typed failures, concurrency, resource lifetimes, dependency injection, scheduling, and observability all matter here.

The package boundary should still be domain-oriented. Effect Schema may remain part of the v1 compatibility surface because existing workflows already use it. The reusable contracts should avoid accidental dependencies on T3Team services, SQLite, or provider-specific Effect layers. A non-Effect host should be able to implement the runtime ports through a thin adapter.

## First implementation phase

The first version is an extraction, not a language redesign:

- preserve the `.workflow.ts` file shape and top-level `await`;
- preserve `tools.*`, `scripts.*`, `thread.*`, `agent`, `workflow`, `parallel`, `pipeline`, and `waitUntil`;
- preserve the distinction between the generic `agent` primitive and T3Code-specific `spawnThread` / `Thread` behavior;
- preserve `scripts.*` as a dedicated arbitrary-code extension surface;
- preserve current journal ordering, replay behavior, handle correlations, capability checks, and error behavior;
- preserve the current T3Code/T3Team broker and persistence integration through an adapter;
- start with the existing embedded/SQLite-style host while keeping runtime ports suitable for distributed backends;
- make the current `@t3team/sdk` facade continue to work;
- add compatibility and replay tests before changing semantics.

External durability systems are a later integration target, not a first-phase extraction requirement. A given run should have one source of durability; the runbook journal and an external workflow history must not independently replay the same execution.

## Roadmap for this branch

The branch can progress through these stages without changing the authoring contract:

1. **Compatibility extraction:** move the existing runtime behind package boundaries and keep current T3Code/T3Team workflows working unchanged.
2. **Reusable implementation:** make the core ports, typed capability contracts, agent package, loader, persistence, and host adapter explicit and testable.
3. **Optional catalog modularization:** split tool catalogs only where a concrete application needs distribution or reuse.
4. **Deployment adapters:** add backends such as distributed database/queue hosts and integrations with established durable workflow systems.

The first commit may be documentation-only, but the branch is deliberately named and scoped to continue into the implementation work.

## Open design questions

- Should the compatibility adapter be named `runbook-t3code` or `runbook-t3team` once the host/product naming settles?
- Do any concrete applications need shared catalog packages, or is defining tools locally sufficient?
- Should scripts remain atomic asynchronous calls, or should a future script mode be allowed to durably suspend on `agent`, `waitUntil`, or thread replies?
- What are the exact semantics of the existing `runWorkflow(...)` launch path, and does it already cover the required child-workflow use cases?
