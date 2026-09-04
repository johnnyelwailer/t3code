# 42 — Signal sources: author-defined event triggers

**Status: design, approved by PJ 2026-08-30. Not built.**

Origin: PJ asked for workflows driven by real external events, not polling —

> "you are my github maintainer for repo xx, a permanent watcher for new issues and PRs...
> the naive way would be polling... the 'cool' way would be a real event trigger... same for the
> jira one... although the mechanism probably doesn't exist currently (eg a native way to register
> sort of durable triggers based on some queries)"

and then, on the producer half:

> "an agent creating a workflow should be able to define a custom event trigger of sorts... as a
> node style script"

> "the producer part `signal()` probably doesn't happen in the workflow.ts itself, but likely in its
> own script, that may be full of effectful stuff, talking with OS, registering webhooks etc"

That second observation is the load-bearing one, and it drives the whole design.

---

## 1. Why the workflow body cannot host a trigger

A `.workflow.ts` body is **replayed**. Every `await` in it resolves from the journal on replay.
`registerWebhook()`, `fs.watch()`, `http.createServer()` cannot live there: replay would either
re-run the effect or diverge from the recorded result.

Worse, a suspended workflow **is not running at all**. It cannot hold a socket open, cannot keep a
listener alive, and cannot call a cleanup function on its way out if the host crashed.

So the producer is not a function the workflow calls. It is a separate artifact with a different
execution model, whose lifetime the *engine* owns.

| | `.workflow.ts` | `.source.ts` |
|---|---|---|
| execution | replayed, deterministic | runs once, for real, never replayed |
| may perform | engine verbs only | OS, network, webhooks, sockets, subprocesses |
| lifetime | suspends for weeks | must stay up while anyone needs it |
| started by | a launch | the engine's reconciler |

## 2. Three concepts

- **Signal** — a typed event *shape*. Declared once, imported by both sides.
- **Source** — an effectful, supervised producer of one or more signals.
- **Consumer** — a workflow suspended on a signal.

### Why signal and source are separate

Considered and deliberately kept separate. One signal has many possible producers: a webhook source
today, a polling source on a host that cannot receive inbound traffic, an agent calling a tool, a
test harness. Consumers never learn which. That is exactly the poll-now-push-later substitution this
design exists to enable, and the split turns it into a one-line change instead of a migration.

The cost of the split is a dangling binding: from a bare `waitForSignal(X)` the engine cannot know
which source to start, or with what parameters. Resolving that by search ("find a source that emits
X") is ambiguous the moment two do. **So the binding is explicit** — see §3.

## 3. API surface

### Two SDK entrypoints, enforcing the split at the import

```ts
import { waitUntil, getSignalSource } from "@t3team/sdk"          // replayed. no effects.
import { defineSignalSource }         from "@t3team/sdk/source"   // effects. no engine verbs.
```

A workflow cannot reach `ctx.emit`; a source cannot reach `waitUntil`. The rule that would otherwise
live in documentation is enforced by what is importable.

### `defineSignal` — the shared contract

```ts
// signals.ts — imported by producer, consumer, and the HTTP boundary
export const ChangeRequestMerged = defineSignal("scm.change-request.merged", Schema.Struct({
  changeRequest: ChangeRequest,        // reuses the contracts type
  mergedBy:      Schema.String,
}))
```

One declaration is the single source of truth. It gives the consumer an inferred payload type, and
it is the runtime validator at every boundary — including an untrusted external POST, which
therefore cannot inject a shape the consumer is not typed for.

### `defineSignalSource` — the effectful producer

```ts
export default defineSignalSource({
  name:   "scm-change-requests",
  params: Schema.Struct({ repo: Schema.String }),
  emits:  [ChangeRequestMerged, ChangeRequestOpened],
  async start(ctx) {
    const hook = await registerWebhook(ctx.params.repo, ctx.callbackUrl)
    server.on("change_request", (e) =>
      ctx.emit(ChangeRequestMerged, { key: String(e.number) },
               { changeRequest: e.cr, mergedBy: e.sender }))
    return { stop: () => hook.delete() }
  },
})
```

`ctx.emit` is narrowed by `emits`: emitting an undeclared signal, or a mistyped payload for a
declared one, is a compile error. That is the producer end of end-to-end type safety.

### `getSignalSource` — the consumer's explicit bind

```ts
const scm = getSignalSource(ScmChangeRequests, { repo: "nexplore/foo" })
const ev  = await scm.waitFor(ChangeRequestMerged, { key: String(pr) })
//    ^? { changeRequest: ChangeRequest; mergedBy: string }
```

`scm.waitFor` accepts only signals in that source's `emits`. Swapping `ScmChangeRequests` for a
polling implementation that emits the same signals changes one line; consumers are untouched.

**Naming.** `get*` matches the existing run-scoped accessors (`getScripts`, `getTools`, `getThread`,
`getArgs`, `getBudget`). `use*` was rejected: no `use`-prefixed export exists anywhere in
`packages/t3team-sdk/src` (verified — the only `use*` in the repo is vitest's `useFakeTimers`), and
it would import React vocabulary carrying none of React's meaning. `spawn*` was rejected because it
implies exclusive ownership the caller does not have (see §4).

A bare `waitForSignal(X)` remains legal **only** for signals with no source — an agent poke, another
workflow, a test — where there is nothing to start.

## 4. Params are identity, not configuration

`(source name, params)` is the key of a running instance. Three workflows watching
`nexplore/foo` share **one** webhook registration; a fourth watching `nexplore/bar` gets its own.

This is what makes one-shot watches free rather than a second mechanism. Granularity is a source
*implementation* choice, expressed entirely through what goes in `params`:

```ts
getSignalSource(ScmChangeRequests, { repo: "nexplore/foo" })            // one instance, all CRs
getSignalSource(SingleChangeRequestHook, { repo: "nexplore/foo", pr: 123 }) // one instance per CR
```

Ten workflows babysitting ten change requests on one repo share a single registration under the
first, or get ten narrow ones that each die on merge under the second — same verb, same handle.

Consequences that follow directly:

- **Params must be canonical** — stable field order, hashed — or the key does not dedup.
- **No secrets in params.** The key is stored, logged, and shown in debug views. Credentials arrive
  by reference and are resolved inside `start()`.
- **Params are a stored schema.** Changing the shape orphans live instances; version accordingly.

## 5. Lifecycle: nobody calls start or stop

Because a suspended workflow is not running, the live set cannot be commanded. It is **derived**:

```
desired = { (source, params) : some live run holds a registration on it }
reconcile(desired, actual) → start what is missing, stop what is orphaned
```

Runs at boot, and whenever a registration appears or disappears. A controller loop.

This yields the required properties without a lifecycle API:

- **restart survival** — `desired` is recomputed from the journal, so instances come back
- **cleanup** — a run that completes, is deleted, or dies drops out of `desired`; its source stops
  with nobody having called `stop()`
- **crash recovery** — a dead source is `actual` drifting from `desired`; the next reconcile fixes it

The registration must therefore be a **journaled fact**, written at `getSignalSource`, not in-memory
state — otherwise it does not survive the event it exists to survive.

## 6. Delivery, and the restart gap

**Delivery reuses the existing resume path** — `appendResolvedEntry` + `resumeWorkflow`, the same
mechanism `t3team-workflowEngineReactor.ts` uses for `askUser` / `askAgent`. No parallel resume path;
a signal resolves a parked correlation exactly as an answer does.

**A signal delivered while the run is not parked must not be lost.** If delivery only worked while
someone waits, every use is racy — the change request merges in the 200 ms between two suspensions
and the run waits forever. So `(run, name, key)` needs a durable inbox: deliveries land there, and
`waitFor` drains it before parking.

**Honest limitation: an inbox does not cover the restart window.** If the host is down when a webhook
fires, there is no process to receive it and no inbox entry is written. A source that genuinely
survives restart needs a durable cursor and a catch-up sweep in `start()` — i.e. push *plus* a
reconciling poll. Any claim of pure-push durability is false about exactly this window.

**`start()` runs again after every restart, so it must be idempotent** — re-registering must not
create a second webhook. This is a real contract on the source author and the most likely place for
hand-written sources to break.

## 7. Security

- **Delivery is capability-gated.** A producer must hold an explicit capability to deliver to a
  signal; ambient delivery would let anything drive someone else's run. Decided over the
  alternatives (project scope, run-id possession) because a capability is greppable and reviewable.
- **Inbox entries expire.** A signal for a run that never waits again must not accumulate; unbounded
  per-key inboxes are a leak that surfaces in month three.
- **The Schema is the trust boundary** for external producers. Decode, then deliver.

## 8. Built-in source catalog

Neutral vocabulary per the repo rule: the type for a pull/merge request is **`ChangeRequest`**
(`packages/contracts/src/sourceControl.ts`), spanning `SourceControlProviderKind` = github / gitlab /
azure-devops / bitbucket via `SourceControlProviderRegistry`.

### Tier A — providers and payload types both already exist

| source | signals | notes |
|---|---|---|
| `ChangeRequestWatch` | opened, merged, closed, draft→ready | payload reuses `ChangeRequest`, `ChangeRequestState` |
| `ChangeRequestChecks` | checks passed / failed / running | reuses `PullRequestCheck`, `PullRequestChecksState`. **This is what "babysit until merged" actually waits on** — merge is the last event; checks are the interesting ones |
| `ChangeRequestReview` | submitted, changes requested, thread replied | reuses `PullRequestReviewDecision`, `PullRequestReviewVerdict`, `PullRequestReviewThread` |

Provider-agnostic for free by riding the existing registry.

### Tier B — work items (Jira, GH Issues, Azure Boards)

Grounding, so the estimate is honest: `WorkItem*` vocabulary **does** exist and is rich (~25 types
across `packages/contracts/src`, `packages/shared/src`, `packages/t3team-sdk/src`,
`apps/server/src` — `WorkItemFieldChange`, `WorkItemLinkedIssue`, `WorkItemNamedRef`,
`WorkItemParentRef`, `WorkItemPerson`, `WorkItemSprintRef`, …). A change-detection path also exists:
`WorkItemContextSyncQueueRequest` and `t3team-contextRefreshServiceDedup.ts`.

What is missing is narrower than "the whole abstraction": **there is no work-item provider registry**
(searched `packages/*/src` and `apps/*/src` for `WorkItem*(Registry|Provider)*` — empty), where
change requests have `SourceControlProviderRegistry`. Note also `packages/shared/src/t3team-githubActivity.ts`
is vendor-named, which by the repo's own rule 3 is a signal that the neutral seam was skipped there.

So Tier B = the provider registry + a source wrapper over the existing sync path. Larger than
Tier A, smaller than greenfield.

### Tier C — no external provider, no auth, no webhook

The engine already knows all of this. Cheapest to build, and two of them are the highest-leverage
items in the catalog.

| source | fires when | why |
|---|---|---|
| `InboundWebhook` | anything POSTs its minted URL | **the escape hatch.** Decodes against the caller's schema, so a new SaaS needs zero shipped code. Without it, the catalog needs a source per vendor forever |
| `ProviderHealth` | a credential goes invalid, auth expires | `SourceControlProviderAuthStatus` exists. Directly addresses the `invalid_mcp_credential` incident of 2026-08-30, where a healthy-looking app sat on a dead MCP backend for ~50 minutes |
| `WorkflowCompleted` | another run finishes | fan-in between independent workflows with no parent/child ownership |
| `ThreadActivity` | a message lands in a thread | "watch my conversation for X" |
| `BudgetThreshold` | usage crosses a line | `getBudget` and `UsageProviderKind` both exist |

### Tier C-OS — host and operating-system triggers

Local, no auth, no provider, no network. The machine is already observable; these expose it.

| source | fires when | why it earns a slot |
|---|---|---|
| `HostAwake` | host boots, wakes from sleep, or the app restarts | **this is the answer to §6's restart gap.** A source cannot receive events while the host is down, but a workflow *can* be told the gap happened and run its own catch-up. It turns an unclosable hole into a handled one |
| `PathChanged` | file, directory, branch or tag changes | universal across platforms; the workhorse |
| `ProcessLifecycle` | a named process starts or exits, with exit code | "when the build finishes"; "when the dev server dies, restart it and tell me" |
| `PortReachable` | a TCP port becomes reachable, or stops being | dev-server up/down without a poll loop in the workflow body |
| `VolumeMounted` | an external disk or share appears | backup and import workflows |
| `NetworkChanged` | online/offline, or joined a named network | "when I'm on the office network, sync" |
| `DiskSpace` | free space crosses a threshold | ordinary ops hygiene |
| `PowerState` | AC vs battery, lid open/close | gate expensive work to when the machine is plugged in |

`CommandOutput` — a long-running command emitting a line matching an author-supplied pattern — is
plausible but deliberately parked. The pattern is user-written rather than system-inferred, so it
does not violate the no-heuristics rule, but it overlaps `ProcessLifecycle` plus a script poll and
should not ship until something needs it.

**Deliberately excluded, as a decision rather than an oversight:** clipboard contents, keystrokes,
foreground-application tracking, window titles. All are trivially observable and would turn the
catalog into a surveillance surface. If a use case ever demands one, it arrives with an explicit
consent story, not by quiet extension of this list.

### Platform availability is part of the contract

OS triggers diverge sharply across darwin / win32 / linux — `PathChanged` is universal, `PowerState`
and lid events are not. A source therefore declares the platforms it supports, and
**`getSignalSource` on an unsupported platform fails at bind time with a clear error**, never parks
forever waiting for an event that physically cannot arrive. A workflow hanging silently on a Linux
host because its author developed on a Mac is the failure mode this rule exists to prevent.

### Deliberately absent: a schedule source

`waitUntil` plus a `while` loop already expresses recurrence. Wrapping that in a source would
recreate the cron concept explicitly rejected:

> "we don't need another cron concept like 'every 5m', we already solved that with waitUntil +
> while loops"

## 9. The four driving examples

| prompt | mechanism | new machinery |
|---|---|---|
| "every sunday morning at X do Y" | `while (true) { await waitUntil(nextSunday()); … }` | **none** — works today |
| "babysit PR xyz until it is merged" | `getSignalSource(ChangeRequestChecks, {repo, pr})` then `waitFor` | Tier A |
| "github maintainer for repo xx — watch issues and PRs, triage, review, merge easy ones, sync upstream" | one long-lived run, several `waitFor`s across Tier A + B sources | Tier A now, Tier B for issues |
| "digest whenever something changes in this jira project related to my work" | Tier B source over the existing context-refresh path | work-item provider registry |

All four must survive an app restart; §5 and §6 are what make that true, and §6 states precisely
where it is not.

## 10. Implementation phases

1. **`scripts` wired into ephemeral launches.** Today `engineLaunch.ts` passes `scripts: {}`, so
   agent-authored workflows cannot call script files at all. This alone unblocks the polling form of
   examples 2–4, with no signal machinery.
2. **Signals**: `defineSignal`, durable inbox, capability gate, delivery through
   `appendResolvedEntry` + `resumeWorkflow`. Producers: engine verb and tool. No sources yet.
3. **Sources**: `defineSignalSource`, the `@t3team/sdk/source` entrypoint, journaled registrations,
   the reconciler, restart behaviour.
4. **Catalog**: Tier C first (`InboundWebhook`, `ProviderHealth`), then Tier A, then Tier B.

Phases 1 and 2 each deliver user-visible value alone, which is the reason for that order.

## 11. Open questions

- Does a source instance need a health/liveness signal of its own, so a workflow can react to its
  own trigger being broken — or does `ProviderHealth` cover it?
- Reconciler ownership in multi-host deployments: one leader, or per-host with a lease?
- Should `emits` permit a source to declare signals it forwards but does not originate?

## 12. Related

- `docs/t3team-mvp/25-workflow-engine.md` — engine, primitives, suspension model
- `packages/contracts/src/sourceControl.ts` — `ChangeRequest`, `SourceControlProviderKind`
- `apps/server/src/t3team-workflowEngineReactor.ts` — the resume path signals reuse
