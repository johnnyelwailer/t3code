# Durable Backend Adapters

Status: architecture and future implementation direction.

The runbook engine can be useful in two deployment modes:

1. **Runbook-owned durability:** the runbook journal is authoritative, while a host supplies storage, scheduling, dispatch, and process ownership.
2. **Backend-owned durability:** an existing durable workflow system is authoritative, and the runbook authoring surface is mapped onto that system's history, timers, activities, signals, or events.

The second mode is possible only if the two systems do not independently replay the same execution. Running two journals for one run creates ambiguous ordering, duplicate effects, and incompatible versioning rules.

## Core adapter ports

The reusable runtime should expose ports for the parts that vary by deployment:

```text
JournalStore
  append and read ordered primitive entries and resolutions

RunStore
  run metadata, status, pending handles, wake deadlines,
  cancellation, ownership, leases, and fencing

WakeScheduler
  durable timer registration and wake delivery

ResumeDispatcher
  route a resolved handle or due timer to an execution worker

HostBroker
  execute thread, agent, tool, script, and host lifecycle operations

WorkflowSource
  resolve a logical workflow identity to the exact executable artifact
```

The current implementation already has strong journal and broker seams. `RunStore`, distributed ownership, and exact workflow-artifact resolution need to become explicit as part of the extraction.

## Integration patterns

### Temporal

Temporal's TypeScript model replays workflow code against an ordered Event History. External operations such as API calls, database access, file I/O, and LLM invocations belong in Activities; message passing is provided through Queries, Signals, and Updates.

The natural adapter mapping is:

```text
tools.* / scripts.*     → Activities
thread.askUser          → Signal or Update + durable wait
thread.askAgent         → Activity or child workflow + durable wait
waitUntil                → Temporal Timer
workflow(...)            → Child Workflow
```

This is a strong integration, but also the most constrained: the runbook TypeScript loader and its replay rules would need to operate inside Temporal's workflow execution model, or the complete runbook body would need to run as one Temporal Activity. The latter preserves runbook semantics but gives Temporal less visibility into individual primitives.

See the [Temporal workflow replay model](https://docs.temporal.io/workflows) and [TypeScript message passing](https://docs.temporal.io/develop/typescript/message-passing).

### Restate

Restate is conceptually close to the handle-based runbook model. Its TypeScript SDK provides durable timers, durable promises, and awakeables for external events, human approvals, and callbacks.

The natural adapter mapping is:

```text
waitUntil                → durable timer
askUser / askAgent       → durable promise or awakeable
thread.notify*           → durable service/message call
tools.* / scripts.*      → durable actions
```

Restate is a promising future adapter for headless and distributed runs because the external-event model resembles the runbook `sent` / `resolved` handle split.

See [Restate durable timers](https://docs.restate.dev/develop/ts/durable-timers) and [external events](https://docs.restate.dev/develop/ts/external-events).

### Inngest

Inngest checkpoints named Steps and provides durable sleep and event-wait primitives. A runbook adapter could map primitive boundaries to Steps, `waitUntil` to `step.sleepUntil`, and external replies to `step.waitForEvent`.

The main mismatch is identity: Inngest uses stable step IDs to memoize completed work, while the current runbook engine uses its ordered journal and primitive sequence. An adapter would need a stable mapping from runbook primitive identity to Inngest step identity, especially around loops, branches, and composition primitives.

See [Inngest Steps](https://www.inngest.com/docs/learn/inngest-steps) and [durable waits](https://www.inngest.com/docs/reference/typescript/durable-endpoints).

### DBOS

DBOS provides durable TypeScript workflows, database-backed checkpoints, durable sleep, and explicit Steps for nondeterministic or external work. It is a plausible adapter for a Postgres-oriented deployment.

The main mismatch is granularity: DBOS treats completed Steps as its checkpoint units, while runbook currently treats its primitive journal as the replay contract. The adapter must choose whether a tool/script/agent call becomes one DBOS Step or whether the runbook journal remains authoritative inside a DBOS workflow.

See [DBOS workflows](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial) and [DBOS Steps](https://docs.dbos.dev/typescript/tutorials/step-tutorial).

## First-phase decision

The first implementation phase should use runbook-owned durability with the existing T3Code/T3Team host adapter:

```text
.workflow.ts
  → extracted runbook engine
  → existing journal and handle semantics
  → T3Code/T3Team broker and persistence adapter
```

The external backends should influence the port design, not the v1 authoring surface or replay semantics.

This branch may later implement those backend adapters after the compatibility extraction and local host path are stable.
