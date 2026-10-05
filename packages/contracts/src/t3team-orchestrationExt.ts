/**
 * Fork (t3team) orchestration contract symbols that lived in the V1
 * `orchestration.ts` module upstream deleted with orchestration V2. Pure
 * schemas only — nothing here depends on the removed V1 read model, so the
 * KEEP-FORK features (project source bindings, workflow runs, cross-environment
 * children, activity state, composing heartbeat) can re-attach them to V2
 * shapes or fork side streams.
 */
import * as Schema from "effect/Schema";

import { EnvironmentId, IsoDateTime, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ProjectWorkSourceProvider = Schema.Literals([
  "atlassian",
  "linear",
  "github",
  "managed",
]);
export type ProjectWorkSourceProvider = typeof ProjectWorkSourceProvider.Type;

/**
 * A project's work-source binding. A non-local provider CANNOT omit the ids —
 * that is what makes "Jira project without a binding" unrepresentable.
 */
export const ProjectSourceBinding = Schema.Union([
  Schema.Struct({ provider: Schema.Literal("local") }),
  Schema.Struct({
    provider: ProjectWorkSourceProvider,
    accountId: TrimmedNonEmptyString,
    externalProjectId: TrimmedNonEmptyString,
    externalProjectKey: Schema.optional(TrimmedNonEmptyString),
    externalProjectUrl: Schema.optional(TrimmedNonEmptyString),
  }),
]);
export type ProjectSourceBinding = typeof ProjectSourceBinding.Type;

/**
 * Deterministic 4-state classification of what a thread's turn is doing NOW (GHE #208):
 * derived on the server from the provider runtime event stream — no inference.
 * `thinking`/`writing` track reasoning vs. assistant-text content deltas; `working`
 * means a tool-lifecycle item is in flight; `waiting` means the output gap exceeded
 * the idle threshold with no tool in flight. A driver that never emits reasoning
 * deltas simply never reports `thinking` — that is correct, not a bug.
 */
export const OrchestrationThreadActivityState = Schema.Literals([
  "thinking",
  "writing",
  "working",
  "waiting",
]);
export type OrchestrationThreadActivityState = typeof OrchestrationThreadActivityState.Type;

/** Durable workflow-engine state joined from `workflow_runs` for the launch thread. */
export const OrchestrationWorkflowRunStatus = Schema.Struct({
  runId: Schema.optional(Schema.String),
  status: Schema.Literals([
    "queued",
    "running",
    "suspended",
    "sleeping",
    "watching",
    "paused",
    "completed",
    "failed",
    "cancelled",
  ]),
  pendingKind: Schema.NullOr(Schema.Literals(["thread.turn", "user.input", "signal.wait"])),
  wakeAt: Schema.NullOr(IsoDateTime),
  updatedAt: IsoDateTime,
});
export type OrchestrationWorkflowRunStatus = typeof OrchestrationWorkflowRunStatus.Type;

/**
 * The execution environment a thread is bound to (env-identity: the same
 * EnvironmentId + label pair every other environment reference in the
 * contracts carries — relay, background, citations). Set on threads created
 * through `t3team.thread.start_child` with an explicit `environment` argument
 * pointing at a DIFFERENT environment than the creating server's own.
 *
 * Delivery boundary (documented, not built here): inter-agent messaging
 * (send_message / mailbox / children ops) reaches only threads in THIS
 * environment's store. A cross-environment child is recorded, bound, and
 * visible to its parent with its environment shown; routing execution and
 * report-back across environments is a separate design (no relay invented
 * by this field).
 */
export const ThreadEnvironmentBinding = Schema.Struct({
  environmentId: EnvironmentId,
  label: Schema.optional(TrimmedNonEmptyString),
});
export type ThreadEnvironmentBinding = typeof ThreadEnvironmentBinding.Type;

/**
 * Per-thread composing heartbeat: the user's composer reports that they are
 * ACTIVELY TYPING in THIS thread's composer. The server treats a fresh
 * heartbeat (inside the typing-lapse window) as user engagement for
 * inter-agent drain back-off — and ONLY typing counts: viewing a thread is
 * not an engagement signal, and one thread's typing never holds another
 * thread's digest. The client sends it debounced and treats it as
 * fire-and-forget: a failure must never block typing or message sending.
 */
export const OrchestrationNoteComposingInput = Schema.Struct({
  threadId: ThreadId,
});
export type OrchestrationNoteComposingInput = typeof OrchestrationNoteComposingInput.Type;

export const OrchestrationNoteComposingResult = Schema.Struct({
  ok: Schema.Literal(true),
});
export type OrchestrationNoteComposingResult = typeof OrchestrationNoteComposingResult.Type;
