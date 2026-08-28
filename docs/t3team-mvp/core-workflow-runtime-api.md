# Core workflow runtime API

The reusable engine in `@runbook/core` (adapted by `@t3team/sdk`) now exposes the four runtime
surfaces a host needs to drive a durable workflow without scraping the journal:

- **Lifecycle events** — a structured `WorkflowEventSink` the host receives run and primitive
  transitions on, in order, as they happen.
- **Typed artifacts** — an `emit` primitive that journals a typed, durable artifact a host can
  surface (report, diff, …) and that replays verbatim.
- **Token usage** — a journaled `usage` primitive a host broker records after agent steps,
  aggregatable per run.
- **Run status + first-class abort** — `inspectRun` derives a run's state from its journal, and an
  `AbortSignal` settles a run as `aborted` instead of `failed`.

All of it is journal-first: every observable is either a journaled entry or a marker the engine
writes into the run's metadata, so a host that restarts mid-run reconstructs the same picture from
disk.

## Lifecycle events

```ts
import { createWorkflowEventSink, type WorkflowEvent } from "@runbook/core/events";

const events: WorkflowEvent[] = [];
const sink = createWorkflowEventSink({
  "run.started": (e) => events.push(e),
  // …one optional handler per event type; omitted handlers are ignored
});
await engine.startWorkflow(ref, args, { runsRoot, events: sink });
```

`WorkflowEventSink` is a single `on(event)` method; `createWorkflowEventSink` adapts per-type
handlers to it. Event types:

| Event                 | Emitted by      | When                                                      |
| --------------------- | --------------- | --------------------------------------------------------- |
| `run.started`         | engine          | at start and at resume (`startKind` distinguishes)        |
| `run.completed`       | engine          | body returned                                             |
| `run.failed`          | engine          | body threw (the original error is rethrown to the caller) |
| `run.suspended`       | engine          | a handle is pending (`correlationId` carried)             |
| `run.aborted`         | engine          | the run settled aborted                                   |
| `primitive.started`   | durable runtime | a live primitive call begins (`seq`, `kind`, `refId`)     |
| `primitive.completed` | durable runtime | the live call is journaled (`seq`, `kind`, `refId`)       |

**Replay emits nothing.** `primitive.*` fire only on the live path — when `exec()` actually runs.
A resumed run replays recorded entries silently; the journal is the source of truth, events are
the real-time view of it. Deterministic primitives (`now`, `random`, `uuid`) are journaled but
emit no events.

The same sink is passed to the SDK's `createDurableWorkflowRuntime` (via `WorkflowRunOptions.events`)
so primitive events and run events land in one ordered stream.

## Typed artifacts (`emit`)

The body emits an artifact through the `emit` verb (imported from `@t3team/sdk` like the other
engine verbs, or bound as a global in the vm context):

```ts
const record = await emit({ type: "report", title: "Q3", data: { rows: 3 } });
// record: { id, type, title?, data, at }
```

`emit` is the `artifact` primitive: the whole record is journaled (the id is minted from host
entropy, not the journaled `uuid` — a nested uuid entry would break the journal's crash-recovery
prefix invariant), so a resumed run reports the **same** artifact ids it reported before.
`title` is omitted from the journaled record when absent (canonical JSON, no `undefined` keys).
Hosts list a run's artifacts with `inspectRun(store, runId).artifacts`.

## Token usage

The host's broker records agent-step spend through the `usage` primitive
(`createUsageRecorder` in `@runbook/core/usage`):

```ts
await recordUsage({ inputTokens: 10, outputTokens: 5, model: "m", step: "plan" });
```

Each observation is journaled (replay-stable). `summarizeUsage` and `inspectRun(...).usage`
aggregate a run's records into `{ inputTokens, outputTokens, records }`. The budget primitive's
`spent()` reader is a separate host-policy concern and is unchanged.

## Run status (`inspectRun`)

```ts
import { inspectRun } from "@runbook/core/status";
const status = await inspectRun(store, runId);
// { state, entryCount, lastSeq, pendingCorrelationIds, artifacts, usage, meta? }
```

`state` is derived from the journal alone:

- `empty` — no journal and no metadata for the run id.
- `in-progress` — journaled work, no terminal marker, nothing pending.
- `suspended` — a `sent` handle entry with no `resolved` reply.
- `completed` / `failed` / `aborted` — the terminal marker the engine writes into run metadata at
  each terminal outcome.

The core cannot know _liveness_ (is the process still driving this run?) — that is a host overlay
on top of `state`.

## First-class abort

```ts
const controller = new AbortController();
const result = await engine.startWorkflow(ref, args, { runsRoot, abortSignal: controller.signal });
// result: { runId, aborted: true } — a distinct AbortedResult, not a failure
```

- A pre-aborted signal settles the run before the body starts; a pre-aborted `resumeWorkflow`
  refuses up front without touching the run's prior terminal state.
- The signal is also checked by the durable runtime before every LIVE primitive execution: once
  it fires, the next live call throws `WorkflowAborted` (exported from `@runbook/core/errors`),
  which the engine converts to the aborted outcome rather than a failure. Replay is unaffected —
  recorded results are returned before the check.
- The run's metadata is marked `terminal: "aborted"`, `run.aborted` is emitted, and **resuming an
  aborted run is refused** — it has no pending work to drive.

## Journal changes

- `RunMeta` gains `terminal?: "completed" | "failed" | "aborted"` and `terminalAt?: string`.
  Only `aborted` is a hard terminal: `completed` and `failed` runs can still be resumed (a
  completed resume re-checks version policy and re-drives the body — the host's established
  repair/re-run path).
- `PRIMITIVE_KINDS` gains `"artifact"` and `"usage"`.

## Host wiring (T3Code)

- `WorkflowRunOptions.events` / `abortSignal` flow `startWorkflow` → `executeWorkflowBody` →
  `createDurableWorkflowRuntime` → the durable primitive seat.
- `emit` is bound into the body globals and exported as an ordinary import from `@t3team/sdk`
  (Epic 25 engine API), so bodies typecheck and stay analysable by binding.
- The host's step-activity emitter (`thread.activity.append`) is a separate concern and can migrate
  to the event sink later; nothing here changes its behavior.
