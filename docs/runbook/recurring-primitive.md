# `recurring` — micro-spec

Status: **draft for review.** Design only; no implementation lands with this document.

This spec unblocks Phase 4 of [Bounded Execution](./bounded-execution.md). It answers that
document's Open Question 1 (*continuation restoration*) for the one shape that needs it first —
long-lived routines — by choosing the "core-managed recurring scope" option it already lists.
It builds on the `checkpoint` slice that is already on `main`
(`packages/runbook-core/src/checkpoint.ts`, `selectReplayWindow`, `RunResume.fromSeq`).

## Problem

### How resume works today

Replay is **positional**. Every journaled call takes the next `seq`
(`durableRuntime.ts` `takeSeq`). On replay, the call at `seq` must match the recorded
`kind` / `refId` / `argsHash` at that `seq` (`handlesDispatch.ts` `assertJournalMatch`);
a `seq` below `maxRecordedSeq` with no record is drift (`gapDrift`); a `seq` above it runs live.

A checkpoint-window resume changes two things (`runEngine.ts` `readReplayWindowChecked`):

1. the body gets only the suffix **strictly after** the boundary seq `B`;
2. the seq counter starts at `B` (`createDurableRuntime({ initialSeq: B })`).

The body still runs **from the top**. The runtime assumes the first journaled call the body
makes is the first call *after* the boundary. Nothing checks that assumption.

### The hazard

Take the obvious routine:

```ts
const repo = await tools.scm.getRepo({ id: args.repoId });  // seq 1 — setup
let state = getResume()?.state ?? { i: 0 };
while (true) {
  await waitUntil(state.nextWake);                          // seq …
  await agent(`triage ${repo.name}`);
  state = { ...state, i: state.i + 1, nextWake: … };
  await checkpoint({ state });                              // seq B
}
```

After a crash, resume re-drives the body with `initialSeq = B`. The setup call now takes
`seq B+1` — the slot the loop owned. Three outcomes, all wrong:

| suffix at `B+1` | what happens | effect |
| --- | --- | --- |
| a recorded `wait.until` | kind mismatch → `ReplayDriftError` | run is bricked; it can never resume |
| empty (crash right after the checkpoint commit) | `B+1 > maxRecordedSeq` → setup runs **live** | external effect fires twice; `repo` is a *new* value, not the one iterations 0…N saw |
| a record that happens to match kind/refId/args | silent replay of the **wrong** result | data corruption with no error |

The setup result is also gone: its entry was compacted into a checkpoint that does not contain
it. Even a perfect replay could not give it back.

This is the same hazard `SubWorkflowCheckpointError` (`packages/runbook-core/src/errors.ts:114`)
exists to prevent for sub-workflows. The one conformance test for checkpoint resume
(`engineCheckpoint.test.ts`) passes only because its body has **no** journaled call before the
loop. The primitive is correct; the authoring pattern around it is not guarded.

Note that "journaled call" is broader than it looks. `now()`, the deterministic `Date`,
`Math.random`, `uuid`, `tools.*`, `agent`, `waitUntil`, `workflow`, `parallel` and `emit` all
take a seq (`primitiveKinds.ts` `PRIMITIVE_KINDS`). A single `new Date()` above the loop is
enough to trigger it.

## Decision

`recurring` is a **callback-taking primitive in `@runbook/core`** that owns the loop, the
inter-iteration wait, the checkpoint, and the seed-from-resume logic. The author never writes
the `while`, never calls `checkpoint()`, never reads `getResume()`.

Two guards make the positional assumption true instead of hoped-for:

- **entry guard** — `recurring` refuses to start unless it is the **first** journaled call the
  body makes in this drive;
- **scope guard** — no raw `checkpoint()`, nested `recurring`, or second `recurring` in the same
  body, and none inside a sub-workflow.

Setup that must run once goes into an explicit **`init`** hook. Its result becomes the first
carried state, so it survives compaction.

## API

```ts
// @runbook/core/recurring — re-exported by @t3team/sdk and bound into body globals.

export interface RecurringIteration {
  /** 0-based index of the iteration now running. */
  readonly iteration: number;
  /** The wake this iteration was scheduled for (epoch ms), or null for an immediate first run. */
  readonly scheduledMs: number | null;
  /** Journaled `now()` read right after the wake resolved. */
  readonly firedAtMs: number;
  /** Scheduled wakes skipped because the host was down past them (see "Missed wakes"). */
  readonly missedWakes: number;
  /** End the loop after this iteration. `output` must be canonical JSON. */
  readonly stop: <O>(output: O) => RecurringStop<O>;
}

export interface RecurringStop<O> {
  readonly [RECURRING_STOP]: true;
  readonly output: O;
}

export type RecurringCadence =
  /** Fixed rate: next = previous scheduled wake + everyMs. Absolute ms, DST-blind by design. */
  | { readonly everyMs: number }
  /** Calendar cadence: a PURE function of journaled instants. Called live once per iteration;
   * its result is journaled, never recomputed on replay. */
  | {
      readonly next: (at: {
        readonly scheduledMs: number | null;
        readonly firedAtMs: number;
        readonly iteration: number;
      }) => number;
    };

export interface RecurringOptions<C> {
  readonly cadence: RecurringCadence;
  /** Seed state. Either a value, or a once-only setup step (may make journaled calls). */
  readonly init: C | (() => Promise<C>);
  /** Run the first iteration immediately instead of waiting for the first wake. Default false. */
  readonly immediate?: boolean;
  /** Hard upper bound. Reaching it ends the loop like `stop`. Default: unbounded. */
  readonly maxIterations?: number;
  /** Compact, canonical-JSON summary of an iteration, stored as `last` in the checkpoint. */
  readonly summarize?: (carried: C, it: RecurringIteration) => unknown;
  /** Forwarded to the checkpoint's retention (history ring = bounded-execution Phase 3). */
  readonly retention?: CheckpointRetention;
}

export type RecurringResult<C, O> =
  | { readonly reason: "stopped"; readonly output: O; readonly iterations: number }
  | { readonly reason: "max-iterations"; readonly carried: C; readonly iterations: number };

export declare function recurring<C, O = never>(
  step: (carried: C, it: RecurringIteration) => Promise<C | RecurringStop<O>>,
  opts: RecurringOptions<C>,
): Promise<RecurringResult<C, O>>;
```

Example — the routine from [Problem](#the-hazard), written safely:

```ts
export default async () => {
  const result = await recurring(
    async (s, it) => {
      await agent(`triage ${s.repoName}`);
      return it.iteration >= 51 ? it.stop({ ran: it.iteration + 1 }) : { ...s };
    },
    {
      init: async () => ({ repoName: (await tools.scm.getRepo({ id: args.repoId })).name }),
      cadence: { everyMs: 7 * 24 * 3600_000 },
    },
  );
  const summary = await tools.report.post({ result }); // post-loop journaled calls are fine
  return summary;
};
```

### Rules

- **`carried` is canonical JSON.** It goes through the same `canonicalJson` encoder as every
  journaled value. A non-encodable value fails at the checkpoint commit, before the wait is sent.
- **Validation before journaling.** `everyMs` and `maxIterations` must be positive integers;
  `everyMs` must be ≥ `RECURRING_MIN_INTERVAL_MS` (value: [Open question 2](#open-questions)).
  A `next()` result must be an integer strictly greater than both `scheduledMs` and `firedAtMs`;
  otherwise the iteration fails with a typed `WorkflowError` and **no** wait is sent. This is
  the frequency floor for recurring; it does not replace the host's `N wakes in M minutes`
  breaker (bounded-execution Phase 6).
- **Time zones.** `recurring` does no calendar math. `everyMs` is absolute milliseconds and
  ignores DST on purpose. Anything calendar-shaped ("Mondays 09:00 Europe/Zurich") goes through
  `next`, built from the passed instants — never from a live clock. Epic 27 names
  `@t3team/sdk/time` (`nextWeekday`, `nextCron`) for this; **it is declared, not implemented**:
  `git grep -n "nextWeekday\|nextCron\|sdk/time" -- packages apps ':!*.md'` on `origin/main`
  (`b18db1d9bb`) returns nothing. A `{ cron, tz }` cadence is deferred until those helpers exist;
  it would be sugar for `next`, not a new journal shape.
- **Capability.** The inter-iteration wait is an ordinary `wait.until`, so a body using
  `recurring` needs the `"schedule"` capability, exactly like `waitUntil`.

### Missed wakes

A host that was down across several scheduled wakes must not replay a burst of iterations.
With `everyMs`, after a wake fires late, the next wake is the **first future slot** on the
original grid:

```text
missedWakes = floor((firedAt - scheduled) / everyMs)      // passed to THIS step
next        = scheduled + everyMs * (missedWakes + 1)      // first grid slot after firedAt
```

So the late wake runs **once**, reports `missedWakes`, and the grid does not drift. A `next()`
cadence gets `firedAtMs` and decides itself (`missedWakes` is always 0 for it); the
strict-future rule above still applies.

### Relationship to `waitUntil`

`recurring` **composes with** `waitUntil`; it does not replace it.

- The wait **between** iterations is owned by `recurring` and is a real `wait.until` call — same
  kind, same scheduler delivery (`scheduling.ts` `createSchedulePrimitives`), same host settle
  path. No new scheduler, no new `PrimitiveKind` for the wake.
- A `waitUntil` **inside** the step is allowed. It is ordinary iteration work: its entries sit in
  the iteration suffix and replay positionally, and the step only returns — so the checkpoint
  only commits — after it resolved. That keeps it out of `unresolvedPrefixCorrelationIds`.
- A hand-written `while (…) { await waitUntil(…) }` routine stays legal and stays a full-replay
  run. `recurring` is the bounded form, not a mandatory rewrite.

## Journal shape, replay rule, retention

### Checkpoint envelope

`recurring` introduces **no new entry kind**. Each boundary is an ordinary `checkpoint` entry
(`kind: "checkpoint"`, `refId: "checkpoint"`) whose `state` is this envelope:

```ts
interface RecurringEnvelope<C> {
  readonly v: 1;
  readonly primitive: "recurring";
  readonly status: "active" | "finished";
  /** Index of the NEXT iteration to run. */
  readonly iteration: number;
  readonly carried: C;
  /** Wake the next iteration waits for; null = run immediately (only with `immediate`). */
  readonly nextWakeMs: number | null;
  /** `summarize()` of the last completed iteration, if configured. */
  readonly last?: unknown;
  /** Present when status = "finished": the RecurringResult to hand back without re-running. */
  readonly result?: RecurringResult<C, unknown>;
}
```

The envelope is inside `state`, so it is covered by the checkpoint's `argsHash` drift check for
free (`checkpoint.ts` passes `{ state, retention }` as `args`).

### Seq layout

```text
fresh run
  [init calls…] [now] [checkpoint E0 {iteration:0, nextWakeMs:w0}] [wait.until w0] ── park
                                                                        │ settled
  [now] [step calls…] [now] [checkpoint E1 {iteration:1, nextWakeMs:w1}] [wait.until w1] ── park
  …
  [now] [step calls…] [checkpoint En {status:"finished", result}] [post-loop calls…]
```

The checkpoint commits **before** the wait is sent. While the run is parked — which is almost
all of its life — the replay window is **one entry**: the `wait.until` `sent` record. The
iteration's detail is already behind the boundary.

### Replay rule

On entry, `recurring` reads the run's restored checkpoint (`RunResume.checkpoint`, today exposed
to the body as `resume` / `getResume()`):

| restored state | action |
| --- | --- |
| none | fresh: run the entry guard, run `init`, commit `E0`, continue |
| envelope, `status: "active"` | seed `carried` / `iteration` / `nextWakeMs` from it; skip `init`; send `wait.until(nextWakeMs)` (it replays against the suffix, or suspends, or fires live if the crash hit between commit and send); then run the step |
| envelope, `status: "finished"` | return `result` immediately; make no journaled call |
| anything else | throw `RecurringResumeMismatchError` (see guard) |

Inside the step, calls replay positionally against the suffix, exactly like today. Calls that
completed before the crash replay; the rest run live.

**Delivery stays at-least-once.** A call whose `exec` started but whose result was never
journaled runs again on resume. For handle kinds, the `correlationId` is `runId:seq` and is
stable, so the host dedupes (`handlesDispatch.ts:89`). `recurring` does not weaken or strengthen
this.

**Crash during `init`** (before `E0`): there is no checkpoint, so the resume is a full replay
from seq 0. `init`'s journaled calls replay; nothing fires twice.

### Retention

| | |
| --- | --- |
| Durable journal shape | `checkpoint` entries carrying `RecurringEnvelope` (iteration, carried, next wake, status, compact `last`); `wait.until` `sent` / `resolved` pairs between them |
| Replay rule | Restore the latest valid envelope, skip `init`, re-issue the wait at `B+1`, replay the active iteration's suffix |
| Retention policy | Compact envelope only; superseded iterations follow `retention.superseded` (default `"archive"`, per `normalizeCheckpointRetention`); `retention.history` sizes the `last` ring once the Phase 3 projection exists |

`history(n)` is not built yet: `checkpoint.ts` records `retainedHistory` as a number and
`status.ts` exposes only the active boundary's state. Until Phase 3, only `last` of the latest
envelope is materialized.

## The guard

### Error class

One class, mirroring `SubWorkflowCheckpointError`: extends `WorkflowError`, fixed `name`,
fixed message per reason that says what to move where. Lives next to it in
`packages/runbook-core/src/errors.ts`, re-exported by the SDK and bound as a body global.

```ts
export type RecurringScopeViolation =
  | "journaled-call-before-entry" // a seq was taken in this drive before recurring()
  | "sub-workflow"                // recurring() inside a workflow() child
  | "nested"                      // recurring() inside a recurring step
  | "second-entry"                // a second recurring() in the same body
  | "checkpoint-in-scope";        // raw checkpoint() in a body that uses recurring

export class RecurringScopeError extends WorkflowError {
  readonly violation: RecurringScopeViolation;
}

/** Restored checkpoint state is not a RecurringEnvelope v1. */
export class RecurringResumeMismatchError extends WorkflowError {}
```

### Entry guard — exact rule

At entry, `recurring` compares the runtime's seq cursor with the seq the drive started at:

```text
allowed  ⇔  runtime.currentSeq() === (resume?.fromSeq ?? 0)
```

That is precise, not heuristic: any journaled call before entry advanced the cursor. It needs one
small seam — the drive's start seq must reach `recurring`. `createDurableRuntime` already holds
it (`initialSeq`); expose it as `startSeq()` next to `currentSeq()`.

Refusal throws **before** `recurring` takes a seq, so the journal is unchanged — the same
"throws before any boundary is journaled" property the sub-workflow guard has. The message
names the fix: *"move setup into `init`, or compute it from `args` without journaled calls."*

Non-journaled code before entry is allowed: reading `args`, pure computation, declaring
constants. Scripts are excluded from the journal and already re-run on every resume
(`__fixtures__/t3team-sdk.journalScript.workflow.ts`); that is existing behavior, not a
`recurring` concern.

### Scope guard

| violation | how it is detected |
| --- | --- |
| `sub-workflow` | the child primitive set gets a refusing stand-in, exactly like `subWorkflowCheckpoint` in `t3team-sdk.subWorkflows.ts` |
| `nested` | an in-scope flag set while the step runs |
| `second-entry` | a per-drive "entered" flag; also caught by the entry guard, but this gives the better message |
| `checkpoint-in-scope` | once a body enters `recurring`, its `checkpoint` binding refuses for the rest of the drive. A raw checkpoint before entry is already a `journaled-call-before-entry`. |

Why refuse `checkpoint()` after the loop too: a post-loop checkpoint would become the latest
boundary, and on the next resume `recurring` would be handed a state that is not its envelope.
The finished envelope already covers "resume after the loop"; post-loop calls replay
positionally after it.

## Conformance tests

Location: `packages/runbook-core/src/recurring.test.ts` (unit, in-memory journal) and
`packages/runbook-core/src/engineRecurring.test.ts` (real engine + `FsJournalStore`, same harness
as `engineCheckpoint.test.ts`). SDK-surface tests (globals, sub-workflow stand-in) go in
`packages/t3team-sdk/src/t3team-sdk.recurring.test.ts` with fixtures under `__fixtures__/`.

Every test counts live `exec` calls per `(kind, refId, args)` across **all** drives, and uses a
host scheduler stub that settles `wait.until` on demand, so parking and waking are explicit.

| # | scenario | assertions |
| --- | --- | --- |
| C1 | **Crash mid-iteration N.** `init` makes one tool call. Step makes two tool calls `a(i)`, `b(i)`. Crash after `a(N)` is journaled, before `b(N)`. Resume. | `init` tool exec count = **1** over the run's lifetime; `a(N)` replays (exec count 1); `b(N)` runs live once; iteration N+1 receives the carried state returned by iteration N; every `a(i)`/`b(i)` exec count = 1 |
| C2 | **Crash between checkpoint commit and wait send.** | resume sends `wait.until(nextWakeMs)` live exactly once, with the envelope's deadline; no step call re-fires |
| C3 | **Parked resume.** Run parks at wake N; settle; resume. | materialized `bySeq` on the resume drive = **1** (the `wait.until` sent); `inspectRun.checkpoint.state.iteration` = N |
| C4 | **Crash during `init`**, after its first of two tool calls. | no checkpoint exists; full replay; first call replays, second runs live; `E0.carried` equals `init`'s return |
| C5 | **Entry guard.** One fixture per journaled kind before entry: `tools.*`, `now()`, `new Date()`, `uuid`, `waitUntil`, `workflow`, `emit`. | throws `RecurringScopeError` with `violation: "journaled-call-before-entry"`; journal `bySeq` size equals the size before the `recurring` call (nothing journaled by `recurring`) |
| C6 | **Entry guard allows non-journaled prelude**: read `args`, pure computation. | runs normally |
| C7 | **Scope guard** — `recurring` in a sub-workflow; nested `recurring`; second `recurring` after the first returns; `checkpoint()` inside the step; `checkpoint()` after the loop. | each throws `RecurringScopeError` with the matching `violation`; no checkpoint boundary journaled by the refused call |
| C8 | **Stop, then crash post-loop.** Step calls `it.stop(x)`; a post-loop tool call is journaled; crash; resume. | `recurring` returns the recorded `result` without running the step or `init`; post-loop tool call replays (exec count 1) |
| C9 | **`maxIterations`.** | loop ends after exactly `maxIterations`; result `reason: "max-iterations"`; finished envelope committed |
| C10 | **Missed wakes.** `everyMs = 1h`; settle wake N five hours late. | exactly **one** step runs; `it.missedWakes = 5` on that step; next `nextWakeMs` is the first grid slot after `firedAtMs` |
| C11 | **Drift is loud.** Change `everyMs`, or the shape of `init`'s value, between crash and resume. | `ReplayDriftError` at the `wait.until` or `checkpoint` argsHash check — never a silent re-seed |
| C12 | **Bounded over a long run.** 200 iterations, crash every 37th, resume each time. | every step call exec count = 1; every resume drive materializes ≤ (calls per iteration + 1) entries; `inspectRun.entryCount` grows, `materializedEntryCount` does not |
| C13 | **Validation before journaling.** `everyMs: 0`, below the floor, non-integer; `maxIterations: 0`; `next()` returning a past or equal instant; non-JSON `carried`. | typed `WorkflowError`; for the first four nothing is journaled; for `next()` / `carried` no `wait.until` is sent |
| C14 | **Mismatched restored state.** Resume a run whose latest checkpoint was written by a raw `checkpoint()` (constructed journal). | `RecurringResumeMismatchError`; nothing journaled |
| C15 | **Backend parity.** C1–C3 against every `JournalStore` that implements `readReplayWindow`. | identical assertions per backend |

C1, C2, C3 and C8 together are the Phase 1 exit condition ("crash-safe commit and identical
result before/after resume") made concrete for the callback-owning form.

## Alternatives considered

| option | what it gives | why not (now) |
| --- | --- | --- |
| **A. Callback owner + entry guard + `init`** (chosen) | the loop, wait, checkpoint and seeding are core code, so the positional assumption is enforced, not documented; testable in core without a loader | the author no longer writes `while`; `break`/`continue` become `return it.stop()` / `return carried`; one `recurring` per body |
| **B. Engine-recognized `while` loop** (loader transform) | author model stays a plain loop — what bounded-execution.md currently promises | needs an AST rewrite that is correct for `break`, `continue`, `try/finally`, closures over loop vars, and early `return`; the body loader lives in the SDK, so this is a T3Team-only mechanism unless the transform moves into core — which the bounded-execution doc forbids; failures are invisible to the author |
| **C. Raw `checkpoint()` + `getResume()` by convention** (what exists today) | zero new API | exactly the hazard in [Problem](#the-hazard); `checkpoint` cannot know it sits in a loop, so no guard is possible |
| **D. Continue-as-new generation** (each iteration a new run) | nothing to replay at all; natural point for code/schema upgrades | breaks one-run identity (status, handles, cards, `inspectRun` history) and needs a host contract to spawn the successor; kept as the candidate answer for envelope/schema migration ([Open question 3](#open-questions)) |
| **E. Checkpoint after the wake** instead of before the wait | the checkpoint time is the fire time | the parked window then holds the whole previous iteration, for the whole idle period — the opposite of bounded |
| **F. Checkpoint every K iterations** | fewer journal lines | the cost is dominated by wakes, and a checkpoint is one line; a crash would replay up to K iterations for no real gain |
| **G. Guard only, no `init`** (the plan as written) | smallest surface | forces setup into iteration 0 behind `if (it.iteration === 0)`, and the setup value must then be threaded through `carried` by hand — the same discipline we are trying to remove |

### Where this deviates from the approved plan

1. **Adds `init`.** The plan had only the refusal guard. The guard alone makes the safe path
   awkward (option G); `init` is the sanctioned place for once-only setup, and its value lands in
   the first envelope.
2. **Broader guard.** The plan refuses a journaled call *before* entry. This spec also refuses
   sub-workflow use, nesting, a second entry, and raw `checkpoint()` anywhere in a recurring body —
   each one moves or confuses the shared boundary the same way.
3. **Finished envelope.** The plan's state covered an active loop only. Without a final
   `status: "finished"` checkpoint, a crash in post-loop code would re-enter the loop.
4. **No cron / tz in v1.** `@t3team/sdk/time` is declared in Epic 27 but not implemented (grep
   above). v1 ships `everyMs` and `next`; `cron` waits for the helpers.
5. **Amends a sentence in bounded-execution.md.** It says *"The author model stays a loop.
   `recurring` is an engine-recognized shape"*. Option A contradicts that. When this spec is
   accepted, that paragraph should point here and say the author writes a step, not a loop.

## Dependencies

- **Builds on `checkpoint`** (`checkpoint.ts`, `selectReplayWindow`, `RunResume`) — reused
  unchanged. `recurring` adds no entry kind and no `JournalStore` method.
- **Composes with `waitUntil`** (`scheduling.ts`) — the inter-iteration wake is a `wait.until`
  call; the scheduler and host settle path are unchanged.
- **One runtime seam:** `DurablePrimitiveRuntime.startSeq()` for the entry guard.
- **SDK binding:** `recurring` in `t3team-sdk.workflowGlobals.ts`; a refusing stand-in in
  `t3team-sdk.subWorkflows.ts`; the top-level body's `checkpoint` binding switches to refusing once
  `recurring` is entered.
- **Not dependent on** Phase 3 (`history(n)` ring, physical prune) — `retention` is forwarded and
  takes effect when that lands.

## Open questions

1. **Envelope size bound.** Should `carried` have a hard byte ceiling (proposal: 64 KiB,
   validated at commit), or is that a host policy?
2. **`RECURRING_MIN_INTERVAL_MS`.** Proposal: 60 s. Is a per-host override needed, and should it
   match whatever floor `waitUntil` enforces? (No `waitUntil` floor found:
   `git grep -n -i "minWait\|MIN_WAIT\|minimum wait" -- packages apps/server/src` hits only
   `MIN_DUE_DELAY_MS` in `t3team-childWait`, which is a different path.)
3. **Envelope / `carried` schema evolution** across a workflow code change (bounded-execution OQ6).
   Candidates: a `version` in `opts` that participates in the checkpoint hash plus a `migrate`
   hook, or a continue-as-new hand-off (option D).
4. **Iteration-scoped deadline.** Should `recurring` offer a per-iteration timeout, or is that
   left to `retry` / `backoff` (Phase 5)?
5. **Signal-driven wake.** A routine that wakes on "whichever comes first — time or a signal" is
   the `watermark` / signal-source case. Out of scope here; it should reuse this envelope rather
   than invent a second one.
6. **UI surfacing.** `inspectRun` already exposes the active checkpoint state; whether routine
   cards read `iteration` / `nextWakeMs` / `last` from the envelope directly, or core adds typed
   fields, is a presentation decision downstream of this spec.
