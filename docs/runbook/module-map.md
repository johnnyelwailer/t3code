# Runbook Module Map

Status: proposed extraction map based on the current T3Team SDK and server implementation.

This is a map of ownership, not a requirement to create one package per file. The first implementation can keep several logical areas in one package while preserving these dependency directions.

## Current public entry points

| Current surface | Current implementation | Proposed ownership |
| --- | --- | --- |
| `workflow(ref, args)` | `packages/t3team-sdk/src/t3team-sdk.engineApi.ts` and `t3team-sdk.primitives.ts` | `@runbook/core` authoring primitive |
| `startWorkflow(ref, args)` | `packages/t3team-sdk/src/t3team-sdk.engine.ts` | `@runbook/core` lifecycle API |
| `resumeWorkflow(runId, ref, args)` | `packages/t3team-sdk/src/t3team-sdk.engine.ts` | `@runbook/core` lifecycle API |
| `t3team.orchestration.run` | `packages/t3team-sdk/src/tools/t3team-sdk.workflow.ts` plus server bindings | T3Code/T3Team adapter tool |
| `defineTool`, `ToolRef`, `tools.*` | `t3team-sdk.ts`, `t3team-sdk.types.ts`, `typeTrees.ts`, `toolScriptCalls.ts` | `@runbook/tools` |
| `defineScript`, `ScriptRef`, `scripts.*` | `t3team-sdk.ts`, `t3team-sdk.types.ts`, `workflowGlobals.ts` | `@runbook/scripts` |
| `agent(...)` | `t3team-sdk.engineApi.ts`, `threadPrimitives.ts` | `@runbook/agent` |
| `spawnThread`, `Thread`, `thread.*` | `threadPrimitives.ts`, `threadTypes.ts`, `broker.ts` | `@runbook/threads` contract plus T3Code binding |
| `.workflow.ts` loading | `loader.ts`, `transpile.ts`, `workflowGlobals.ts` | `@runbook/ts` |
| ordered journals and replay | `journal.ts`, `journalReader.ts`, `journalWriter.ts`, `journalStore.ts`, `workflowRunner.ts` | `@runbook/core` |

The existing `runWorkflowBody` function in `loader.ts` is an internal execution helper, not another public run API.

## Proposed dependency shape

```text
@runbook/core
  base package: durable runtime, replay, handles, and ports

@runbook/tools       → @runbook/core
@runbook/scripts     → @runbook/core
@runbook/threads     → @runbook/core
@runbook/agent       → @runbook/core (+ optional threads contract)
@runbook/ts          → core + selected authoring packages

@runbook/t3code-adapter
  → @runbook/core + tools + scripts + threads + agent

apps/server
  → @runbook/t3code-adapter
```

`@runbook/core` owns generic execution contracts and the durable runtime. It must not import T3Team clients, server services, project contracts, or T3Code thread objects.

The package names are logical boundaries for now. We can initially implement them as subpaths or a small number of workspace packages if a fully split publish layout would create needless plumbing.

### Implementation checkpoint

`@runbook/core` now owns the first extracted slice: canonical argument/result encoding, the generic workflow error taxonomy, journal path and metadata helpers, journal wire encoding/decoding, replay maps, and the pluggable `JournalStore`/`JournalSink` seam. Its primitive-kind vocabulary is open so adapters and capability packages can add identifiers without changing core.

The T3Code SDK consumes that package through thin adapter entry points and preserves its historical `.t3team-runs` default. Agent, thread, tool, script, and TypeScript-loader extraction remains deliberately separate.

## `@runbook/core`

### Move mostly unchanged

| Current modules | Role |
| --- | --- |
| `t3team-sdk.engine.ts` | `startWorkflow`, `resumeWorkflow`, run results, suspension result |
| `t3team-sdk.workflowRunner.ts` | execute body, replay journal, suspension/failure funnel |
| `t3team-sdk.durableRuntime.ts` | runtime service used by primitive calls |
| `t3team-sdk.durableRuntimePrimitive.ts` | journaled primitive boundary |
| `t3team-sdk.primitives.ts` | `parallel`, `pipeline`, inline `workflow`, deterministic waits |
| `t3team-sdk.journal.ts` | journal entry model and run metadata |
| `t3team-sdk.journalReader.ts` | wire-entry maps and lookup |
| `t3team-sdk.journalWriter.ts` | stable wire serialization |
| `t3team-sdk.journalStore.ts` | `JournalStore`, sink, filesystem implementation split |
| `t3team-sdk.journal.ts` and `replayDrift.ts` | replay drift and run metadata |
| `t3team-sdk.canonicalJson.ts` | stable argument/result hashing |
| `t3team-sdk.handles.ts` | pending/resolved handle model and suspension error |
| `t3team-sdk.handlesDispatch.ts` | sent/resolved dispatch and first-write-wins resolution |
| `t3team-sdk.errors.ts` | generic workflow, journal, replay, and suspension errors |
| `t3team-sdk.runtimeTypes.ts` and `primitiveTypes.ts` | generic runtime/primitive contracts |
| `t3team-sdk.schedulePrimitive.ts` | durable deadline primitive against a scheduler port |

`t3team-sdk.broker.ts` needs a split: the generic message/handle contracts belong near core; T3Team-specific handler construction and thread message mapping belong in the adapter.

`WorkflowRunOptions` and the large `t3team-sdk.types.ts` file also need splitting. The generic part includes run ID, journal store, broker port, model-neutral execution options, and primitive hooks. Workspace, GitHub/Jira clients, T3Team services, and product runtime modes stay outside core.

### New core port needed

The current engine has journal persistence, but the server owns additional run state. The extracted core should define a `RunStore` port for status, pending handles, wake deadlines, cancellation, ownership, and eventually leases/fencing. The T3Code adapter can implement it with the existing `WorkflowRuns` persistence service.

## `@runbook/tools`

| Current modules | Role |
| --- | --- |
| `t3team-sdk.ts` | `defineTool`, `ToolRef`, execution validation, registration |
| `t3team-sdk.typeTrees.ts` | dotted tool tree construction |
| `t3team-sdk.toolScriptCalls.ts` | dispatch from the workflow runtime into registered callables |
| `t3team-sdk.capabilityVocabulary.ts` | generic capability/group vocabulary |
| `t3team-sdk.capabilityGating.ts` | tool-group and capability checks |
| `t3team-sdk.groups.ts` | current T3Team/GitHub/Jira group definitions; likely adapter or catalog-owned |
| `t3team-sdk.builtins.ts` | current built-in T3Team tool catalog; adapter-owned |
| `t3team-sdk.capabilityScan.ts` | static recognition of tool capability use; likely split with `@runbook/ts` |

The package owns the typed tool surface. Individual applications can define their own tools locally; no universal catalog is required.

## `@runbook/scripts`

| Current modules | Role |
| --- | --- |
| `t3team-sdk.ts` | `defineScript`, script registration and handler validation |
| `t3team-sdk.types.ts` | `ScriptRef`, `ScriptHandlerCtx`, script tree types |
| `t3team-sdk.toolScriptCalls.ts` | script dispatch through the durable runtime |
| `t3team-sdk.workflowGlobals.ts` | `scripts.*` binding into workflow code |
| script capability portions of `capabilityScan.ts` and `capabilityGating.ts` | script availability and permission checks |

Scripts are arbitrary user-authored TypeScript extension code, not merely another tool catalog. The package should own the script execution policy, replay policy, registry, and an executor port. V1 preserves the current atomic behavior: a script may be asynchronous, but its final result is the journal boundary and it does not independently durably suspend.

The generic `ScriptExecutionContext` should expose only host-neutral facilities such as logging, fetch, workspace access, and generic tool access. Adapter-specific capabilities must be injected through an extensible mechanism; generic interfaces must not grow fixed fields such as `github`, `jira`, or `t3team`.

## `@runbook/agent` and `@runbook/threads`

### Agent package

| Current modules | Role |
| --- | --- |
| `t3team-sdk.engineApi.ts` | `agent` accessor and typed result surface |
| `t3team-sdk.modelCascade.ts` | provider/model fallback and recorded selection |
| `t3team-sdk.models.ts` | current model definitions; provider-specific parts leave the package |
| model-related portions of `threadPrimitives.ts` | generic model selection and agent-turn options |
| `t3team-sdk.askAttachments.ts` | generic agent attachment normalization, if kept provider-neutral |

`@runbook/agent` defines the one-shot agent primitive and provider adapter contract. It does not assume T3Code threads.

### Threads package

| Current modules | Role |
| --- | --- |
| `t3team-sdk.threadPrimitives.ts` | `Thread`, `spawnThread`, `askAgent`, `notifyAgent`, `askUser`, and `notifyUser`; split generic contract from T3Code implementation |
| `t3team-sdk.threadTypes.ts` | thread refs, ask options, provider-neutral thread types |
| `t3team-sdk.threadDefaults.ts` | defaults; host-specific portions leave the package |
| `t3team-sdk.handlesDispatch.ts` | shared handle mechanics remain in core; thread mapping uses them |
| `t3team-sdk.askVerb.ts` | generic interaction verb normalization; UI-specific rendering stays outside |
| `t3team-sdk.askRender.ts`, `affordance.ts` | UI/rendering adapter, not core threads |

The T3Code adapter maps these contracts to its broker, thread records, provider model cascade, and user-message system.

## `@runbook/ts`

| Current modules | Role |
| --- | --- |
| `t3team-sdk.loader.ts` | `.workflow.ts` transpilation, metadata extraction, prepared workflow source |
| `t3team-sdk.transpile.ts` | TypeScript source transformation |
| `t3team-sdk.workflowGlobals.ts` | injected globals; compose generic, scripts, tools, agent, and host surfaces |
| `t3team-sdk.bodyRunner.ts` | bind the prepared module body to the runtime |
| `t3team-sdk.workflowShape.ts`, `workflowShapeBindings.ts`, `workflowShapeScan.ts` | static workflow shape analysis |
| `t3team-sdk.typeCheck.ts`, `typeCheckHost.ts` | optional source type-checking |
| `t3team-sdk.determinismScan.ts`, `staticAudit.ts`, `staticAuditTypes.ts` | determinism and capability audits |
| `t3team-sdk.schemaDescribe.ts`, `schemaSketch.ts` | serializable schema/authoring metadata |
| `t3team-sdk.globals.ts`, `surface.ts` | ambient/type surface assembly; product-specific portions split out |

The loader/executor boundary is also where the trusted in-process executor can later be replaced by a worker or sandbox without changing the core journal model.

## T3Code/T3Team adapter and server host

These modules should remain outside the reusable engine:

| Current area | Adapter responsibility |
| --- | --- |
| `apps/server/src/t3team-workflowEngineLaunch.ts`, `Resume.ts`, `Rehydrate.ts`, `Registry.ts` | server lifecycle, run registration, restart recovery |
| `t3team-workflowEngineBroker*.ts` and `t3team-workflowSdkToolBridge.ts` | T3Team broker mapping and host-tool bridge |
| `t3team-workflowScheduler*.ts` | scheduler implementation and wake delivery |
| `t3team-workflowEngineDurability*.ts` | database/journal/run repair and durability orchestration |
| `t3team-workflowEngineStepActivities.ts` | T3Team UI progress projection |
| `t3team-workflowEphemeral*.ts`, `t3team-toolBrokerWorkflowRun*.ts` | `t3team.orchestration.run`, inline source/path launch, ephemeral policy |
| `t3team-workflowRepair*.ts`, `SelfHeal*.ts`, `AdmissionQueue.ts` | T3Team operational policy |
| `apps/server/src/persistence/Services/WorkflowRuns.ts` | `RunStore` implementation |
| `WorkflowJournalStore.ts`, `SqliteJournalStore.ts` | `JournalStore` implementation |
| workflow persistence migrations | application database schema |
| recipe, route, dashboard, completion, and step-activity modules | product/UI integration |

## Proposed extraction order

1. Freeze current replay and public authoring tests as the behavioral baseline.
2. Extract journal, replay, handles, runtime ports, and `startWorkflow`/`resumeWorkflow`.
3. Extract tools and scripts as separate capability packages without changing `tools.*` or `scripts.*` authoring.
4. Split generic agent and thread contracts from T3Code broker/thread implementations.
5. Move the TypeScript loader and static audits behind `@runbook/ts`.
6. Rewire the current server directly to the extracted packages.
7. Only then evaluate distributed run ownership, alternate executors, and external durability adapters.

## Boundary decisions recorded

1. `@runbook/threads` includes both agent and human interaction primitives. T3Code supplies the broker, UI, and persistence binding.
2. `@runbook/tools` is a real package boundary immediately. This does not require shared catalogs; applications may still define tools locally.
3. `ScriptExecutionContext` is generic. Adapter-specific capabilities are fully extensible and pluggable rather than fixed fields in the generic context.
