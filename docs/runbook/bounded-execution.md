# Bounded Execution

## Purpose

This specification defines how `@runbook/core` keeps long-lived workflow runs bounded without changing
the ordinary TypeScript authoring model. A workflow may still use `while`, `for`, `waitUntil`,
tools, scripts, and handles. The engine adds durable checkpoint boundaries so a resume does not
have to replay or materialize every completed iteration since sequence zero.

This document lives in `docs/runbook/` because checkpointing is a host-neutral journal and replay
contract owned by `@runbook/core`. It uses the same Purpose / Why now / model / phasing structure as
the T3Team epics because Epics 25 and 27 are its first consumers, but T3Team presentation and
adapter concerns are deliberately downstream of this contract.

This is a design anchor, not an implementation specification. In particular, the TypeScript in
[Proposed API](#proposed-api) is a type sketch for the first checkpoint slice. It does not add a
second runtime or authorize an implementation hidden in a host adapter.

## Why now

The durable engine is journal-first and replay-from-the-top. Every primitive call occupies a
monotonic `seq`, and resume re-runs the workflow body against the recorded `seq -> JournalEntry`
map until it reaches live work. That is a strong crash-recovery model for finite runs, but its cost
grows without bound for routines:

```text
iteration 1    iteration 2    ...    iteration 10,000    next wake
───────────┬───────────────┬──────┬───────────────────┬───────────
           └──────────── journal prefix replayed again ───────────┘
```

An immortal loop that calls `waitUntil`, an agent, or a tool on every fire has three coupled
failure modes:

- replay cost grows as `O(completed iterations)`;
- storage grows with every detailed result and payload;
- status and UI reads materialize history that the current decision no longer needs.

The memory problem is the same class as hydrating a complete thread history into a decider: the
durable record can remain large while the active working set must stay bounded. A frequency floor
prevents the simplest busy loop, but it does not bound a healthy weekly routine that runs for years.

## The model

The unifying operation is **collapse completed work into a checkpoint and retain only the bounded
detail required by policy**.

A checkpoint is a durable boundary with:

- the logical sequence position it supersedes;
- canonical-JSON compact state needed to continue;
- an optional bounded history ring for presentation and diagnosis;
- the retention policy that says what earlier detail remains materialized.

Checkpoint commit is append-only in phase one: the active replay view advances without rewriting
earlier entries. Readers select the latest valid checkpoint and replay only its suffix. A backend
may later archive or physically prune superseded detail after the checkpoint and its integrity
metadata are durable.

```text
durable record
  old detail ─────────────── checkpoint ── live suffix ── pending work
  retained or archived          │               │
                                └──── replay ────┘

materialized view
  compact state + last N outputs + pending work
```

The checkpoint is the load-bearing primitive. `recurring`, completed fan-out collapse, bounded
history, and bounded hydration are policies or higher-level primitives built on the same boundary.

## The primitives

### `checkpoint` — sequence + compact state

`checkpoint` records the state required to continue after completed work and establishes the
earliest sequence a replay reader needs to materialize. It is the first implementation slice.
Checkpoint creation must be atomic from the replay reader's perspective: a crash may expose the old
view or the new view, never a half-written boundary.

### `recurring` — time + state

A checkpointed interval for long-lived loops. Its compact state contains at least the iteration
counter, carried variables, next-wake data, and a compact last-result summary. Each completed fire
advances the checkpoint; optional `history(n)` retains only the most recent detailed outputs.

The author model stays a loop. `recurring` is an engine-recognized shape and optimization, not a
host-owned scheduler DSL and not a replacement for `waitUntil`.

### `watermark` — data + time

A durable cursor such as an offset, timestamp, revision, or high-water mark. Resume continues from
that cursor rather than scanning already processed input. Source registration, durable delivery,
and catch-up reuse the signal-source model from distro GHE #332; `watermark` is not a second trigger
system.

### `reduce` / `accumulate` — data + bounded state

Fold observations into a compact current state, optionally retaining the last `N` observations.
Freshness pollers, status watchers, and metric accumulators usually need the latest snapshot and a
small diagnostic tail, not every observation ever received.

### `history(n)` — bounded presentation history

A ring of the latest `N` iteration outputs. It is a materialized view over checkpointed detail, not
the recovery journal itself. `inspectRun` can expose the ring without hydrating every superseded
entry.

### `retry` / `backoff` — bounded robustness

A journaled retry policy with explicit attempt and delay bounds. It replaces hand-written retry
loops whose attempts silently expand the journal. Exhaustion remains an ordinary typed workflow
failure.

Implemented in `packages/runbook-core/src/retryBackoff.ts` as
`retry(fn, { maxAttempts, backoff, classify? })`, kind `"retry"`:

- one `retry.start` entry (args: the attempt bound), then one `retry.attempt` settlement per
  attempt carrying its outcome, the last classified failure, and — for a retryable failure — the
  backoff deadline. `classify` and `backoff` run black-boxed inside the live settlement only, so
  jitter takes no seq and a replay never reads the live clock;
- the delay is the existing durable `waitUntil`, so the SDK gates `retry` on `"schedule"`;
- attempts run inline in the run's sequence (like `workflow()`), so `fn` may call `agent()` or
  `workflow()`; a replay re-drives each attempt against the journal, so its effects replay
  instead of re-firing, its closure writes are rebuilt, and an unfinished attempt resumes part-way;
- a primitive that threw inside an attempt left no journal line, so its replay raises a gap drift.
  Inside a settled attempt that gap is resolved by the journaled settlement; anywhere else, and for
  any changed call identity or args, drift stays loud;
- giving up raises `RetryExhaustedError` with `attempts`, `maxAttempts`, and `lastFailure`.

Settlements never accumulate an attempt history. Pruning a settled sequence's attempt detail is a
journal-backend capability, as it is for `checkpoint`. Do not call `checkpoint()` inside `fn`, and
do not use `retry` inside `parallel()`/`pipeline()`: the backoff `waitUntil` cannot durably park
in a black box, exactly as for a bare `waitUntil` there.

Already-completed fan-out items do not require a new primitive: recorded `sent` / `resolved` pairs
already prevent replay from repeating a completed dispatch. Checkpointing only collapses the
completed prefix once it is no longer needed for active replay.

Each primitive must make the three-part contract concrete:

| Primitive               | Durable journal shape                                         | Replay rule                                                        | Retention policy                                         |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| `checkpoint`            | Boundary seq, compact state, policy, schema/version integrity | Restore the latest valid state and replay its suffix               | Archive or prune the superseded prefix only after commit |
| `recurring`             | Iteration, carried state, next wake, compact result           | Resume the active iteration from its checkpoint                    | Keep compact state plus `history(n)`                     |
| `watermark`             | Source identity, cursor, observation time                     | Read strictly after the durable cursor                             | Replace the prior cursor; retain bounded diagnostics     |
| `reduce` / `accumulate` | Reducer identity, current state, optional observation         | Continue folding from the recorded state                           | Replace prior state plus an optional last-`N` ring       |
| `history(n)`            | Ring capacity and ordered retained outputs                    | Rehydrate the recorded ring without scanning old detail            | Evict oldest output when capacity is exceeded            |
| `retry` / `backoff`     | Attempt, journaled deadline, last classified failure          | Resume the current attempt or delay; never rerun a settled attempt | Keep the configured attempt bound and final outcome      |

### Proposed API

The first slice should follow the existing core style: a small host-neutral surface built over
`PrimitiveRuntime.callPrimitive`, with readonly data contracts. Checkpoint-aware persistence is a
separate extension of the existing `JournalStore` seam. `"checkpoint"` becomes a built-in entry in
`PRIMITIVE_KINDS`; `PrimitiveKind` stays open for adapter extensions.

```ts
import type { PrimitiveCall } from "@runbook/core/runtimeTypes";

export interface CheckpointRetention {
  /** Detailed outputs kept in the materialized history view. */
  readonly history?: number;
  /** Superseded detail is kept in durable archive or may be pruned after commit. */
  readonly superseded?: "archive" | "prune";
}

export interface CheckpointInput<State> {
  /** Canonical-JSON state sufficient to continue from this boundary. */
  readonly state: State;
  readonly retention?: CheckpointRetention;
}

export interface CheckpointRecord<State = unknown> {
  /** Highest earlier seq made unnecessary for active replay. */
  readonly compactedThroughSeq: number;
  readonly state: State;
  readonly retainedHistory: number;
  readonly at: string;
}

export interface CheckpointPrimitives {
  readonly checkpoint: <State>(input: CheckpointInput<State>) => Promise<CheckpointRecord<State>>;
}

export interface CheckpointPrimitivesDeps {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  /** Existing DurablePrimitiveRuntime cursor; read inside exec after seq allocation. */
  readonly currentSeq: () => number;
  readonly nowIso: () => string;
}

export declare function createCheckpointPrimitives(
  deps: CheckpointPrimitivesDeps,
): CheckpointPrimitives;
```

The implementation uses fixed call identity `kind: "checkpoint"`, `refId: "checkpoint"`, matching
the stable built-in style of `usage` and `wait.until`. The returned record is the durable result
envelope; the input participates in the existing canonical `argsHash` replay check. As in the
current `DurablePrimitiveRuntime`, `currentSeq()` exposes the already-allocated primitive cursor;
the live `exec` records `compactedThroughSeq` as the highest completed seq before the checkpoint.

The storage seam also needs a checkpoint-aware replay-window read and an atomic checkpoint commit.
Those operations should extend `JournalStore` only after their crash semantics are proven across
the filesystem and database backends. They must not replace `JournalStore` or change the wire
meaning of existing `JournalEntry` values.

The sketch deliberately leaves the continuation-restoration mechanism open. The implementation
must prove how an ordinary TypeScript loop reaches the same logical call site from compact state
without replaying the superseded prefix. That proof must land before the API is stabilized; the
answer may be a loader transform, a core-managed recurring boundary, or a continue-as-new run
generation, but it may not be a T3Team-only shortcut.

## Design invariant

Every bounded-execution primitive is exactly three engine-level things:

1. **A durable journal-entry shape** — the canonical data appended at the boundary.
2. **A replay rule** — how resume validates and restores that boundary.
3. **A retention policy** — what stays materialized, is archived, or can be pruned.

If a proposal cannot state all three, it is not a bounded-execution primitive. If it additionally
assumes a thread, T3Team card, provider, executor, or database product, it belongs in a host adapter
or presentation layer instead of core.

Additional invariants:

- A workflow run is not a thread. Runs own workflow journals; threads are optional interaction
  endpoints supplied through `@runbook/threads`.
- Checkpoints never live in a thread event log.
- Time is read through the journaled clock. A checkpoint policy never calls the live clock from a
  replayed body.
- External-effect delivery remains at-least-once. Compaction must retain every unresolved
  correlation and the stable `correlationId` evidence required for host-side deduplication.
- A checkpoint never hides replay drift. State, policy, and call-site identity participate in the
  same canonical argument hashing and validation rules as other primitives.
- One run has one durability authority. Alternative `JournalStore` backends may implement core's
  persistence ports, but no external engine may independently replay the same run alongside the
  Runbook journal.

## Persistence

Today `JournalStore.readEntries` returns the full `bySeq` and `byCorrelation` maps, and
`inspectRun` derives status, artifacts, usage, entry count, last sequence, and pending handles from
those maps. Bounded execution extends those seams; it does not add parallel tables or a second
controller.

The logical data model is:

- the append-only call / `sent` / `resolved` record already owned by `JournalStore`;
- a committed checkpoint record containing boundary sequence, compact state, retention, and
  integrity/version metadata;
- a bounded history projection;
- a replay-window read that returns the latest valid checkpoint, its required suffix, and every
  unresolved correlation needed for suspension correctness.

`inspectRun` should gain checkpoint-aware fields such as the active boundary, logical total entry
count, materialized entry count, iteration count when known, bounded history, and next wake when a
host supplies it. Existing state derivation remains journal-first. Hosts may overlay liveness and
render routine cards, but core remains authoritative for the durable structure.

Physical pruning is a backend capability, not the definition of checkpoint correctness. Phase one
may retain old rows while bounding reads and replay. A pruning backend must commit the checkpoint
first, preserve terminal and unresolved-handle evidence, and make cleanup retryable and idempotent.
Before pruning, the original entries plus checkpoint are authoritative. After an atomic prune, the
committed checkpoint plus retained suffix are the recovery authority; a cold archive is optional
audit material and must not be independently replayed.

## Capability & limits

- **Host-agnostic.** `@runbook/core` owns checkpoint, replay-window, and retention semantics.
  `@runbook/threads` owns the generic agent/thread transport seam; a host-owned `AgentStepBridge`
  binds it. `@t3team/sdk` only adapts and re-exports the core surface.
- **Runtime-backend-neutral.** Filesystem and database `JournalStore` backends honor the same
  checkpoint contract. Mastra or Temporal may adapt agent execution behind the
  `@runbook/threads` `AgentStepBridge`; they are not core adapters and never own or replay the
  workflow journal.
- **Bounded replay, not free replay.** The target is `O(checkpoint suffix + pending work)` per
  resume. Exact constants depend on the backend and workflow shape.
- **Bounded materialization, not mandatory deletion.** Archive retention can preserve a complete
  audit record while active reads stay bounded.
- **Explicit limits.** `history(n)`, retry attempts, per-loop iteration caps, and checkpoint
  frequency are finite and validated. Negative or unreasonably large bounds fail before journaling.
- **Runaway protection remains separate.** The existing minimum wait catches zero/short sleeps. A
  per-run `N wakes in M minutes` breaker is complementary policy, not checkpoint semantics.
- **No retroactive magic.** Runs created before checkpoint support need an explicit migration or
  remain full-replay runs. Core must not infer compact state from arbitrary old journal entries.

## Phasing

| Phase | Scope                                                                                   | Exit condition                                                                               |
| ----- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | Checkpoint contract: entry shape, replay rule, retention vocabulary, continuation proof | Conformance tests show crash-safe checkpoint commit and identical result before/after resume |
| 2     | `JournalStore` replay windows + checkpoint-aware `inspectRun`                           | Full durable record may grow while active replay/materialization stays bounded               |
| 3     | `history(n)` projection and physical archive/prune capability                           | Bounded UI/status reads; cleanup is retryable and never loses pending effects                |
| 4     | `recurring` and completed fan-out collapse                                              | Long-lived routines replay in `O(checkpoint suffix)` without changing author intent          |
| 5     | `watermark`, `reduce` / `accumulate`, `retry` / `backoff`                               | Data cursors and bounded folds reuse the same checkpoint contract                            |
| 6     | Runaway breaker and operational policy                                                  | Operators can detect/stop pathological wake rates independently of compaction                |

Phase 1 is load-bearing. No higher-level primitive should ship with a private compaction format
while its continuation and crash semantics remain unresolved.

## Open questions

1. **Continuation restoration.** How does a plain TypeScript loop resume at a checkpoint without
   executing its superseded control-flow prefix: loader transform, core-managed recurring scope,
   or continue-as-new generation?
2. **Checkpoint identity.** Is `refId` sufficient as the stable boundary identity, or must the
   loader derive a source location/version stamp as well?
3. **Atomicity across stores.** What is the minimal `JournalStore` contract that gives filesystem
   and database backends the same old-view-or-new-view checkpoint commit guarantee?
4. **Audit defaults.** Should superseded detail default to archive or prune, and which policy may a
   host override for compliance?
5. **Unresolved and settled handles.** How much settled `correlationId` deduplication evidence must
   survive physical pruning, and for how long?
6. **Schema evolution.** How are compact-state schemas versioned, decoded, and migrated when the
   workflow executable changes under an allowed version policy?
7. **Inspection totals.** Should `inspectRun.entryCount` remain the logical lifetime count, with a
   new `materializedEntryCount`, or retain its current materialized-map meaning?
8. **Breaker policy.** What defaults define `N wakes in M minutes`, and is the response suspend,
   abort, or host review?

## References

- [Epic 25: Agent Orchestration Engine](../t3team-mvp/25-workflow-engine.md) — journal ordering, replay,
  determinism, handles, and the `JournalStore` seam.
- [Epic 27: Scheduled Orchestrations](../t3team-mvp/27-scheduled-workflows.md) — routines and the original
  deferred continue-as-new requirement in phase 27.5.
- [Core workflow runtime API](../t3team-mvp/core-workflow-runtime-api.md) — `PRIMITIVE_KINDS`, artifacts,
  usage, `inspectRun`, abort, and the host-owned agent bridge boundary.
- [Reusable Runbook Engine](./README.md) — package boundaries and the rule that
  `@runbook/core` does not assume threads, providers, or a particular host.
- [Durable backend adapters](./durable-backend-adapters.md) — one durability authority per
  run and backend conformance requirements.
- [Distro GHE #332](https://nexplore.ghe.com/pj/nexi-distribution/issues/332) — signal sources,
  durable delivery, restart reconciliation, and catch-up cursors reused by `watermark`.
- [Distro GHE #288](https://nexplore.ghe.com/pj/nexi-distribution/pull/288) — runtime/adapter
  boundary grounding; agent turns remain behind the host bridge rather than becoming core
  checkpoint semantics.
