/**
 * Built-in signal sources — the host CATALOG declarations (design 42 §7).
 *
 * These are the shared DECLARATIONS a body imports to bind a catalog source: the `emits`
 * set, the params schema, and the stable source name. The EFFECTFUL `start` behavior for each
 * lives host-side (the engine's source catalog is keyed by `name`); the declaration and the
 * host implementation are cross-checked by name at boot, so a rename breaks loudly there.
 *
 * Tier A — ChangeRequest (PR/MR) sources. Payloads reuse the neutral ChangeRequest vocabulary
 * (provider, number, title, refs, state, draft, merged/closed timestamps) so a consumer sees
 * the same shape no matter which SCM provider produced the event.
 *
 * Tier B — work-item source. Payloads use the neutral work-item vocabulary (issueKey, title,
 * state, assignee, labels) — the provider-registry expansion lands later; this source wraps
 * the existing Jira integration.
 */

import * as Schema from "effect/Schema";

import {
  builtinSignalSource,
  defineSignal,
  type Signal,
  type SignalSourceRef,
} from "./t3team-sdk.signal.ts";

// ── ChangeRequest payloads (Tier A) ─────────────────────────────────────────

/** The neutral change-request snapshot every Tier A payload carries. */
export const ChangeRequestPayload = Schema.Struct({
  provider: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.optional(Schema.String),
  baseRef: Schema.optional(Schema.String),
  headRef: Schema.optional(Schema.String),
  state: Schema.String,
  isDraft: Schema.optional(Schema.Boolean),
  mergedAt: Schema.optional(Schema.String),
  closedAt: Schema.optional(Schema.String),
});
export type ChangeRequestPayloadType = Schema.Schema.Type<typeof ChangeRequestPayload>;

/** The check-suite snapshot attached to a checks signal. */
export const ChangeRequestChecksPayload = Schema.Struct({
  changeRequest: ChangeRequestPayload,
  conclusion: Schema.String,
  total: Schema.optional(Schema.Number),
  passed: Schema.optional(Schema.Number),
  failed: Schema.optional(Schema.Number),
  pending: Schema.optional(Schema.Number),
});
export type ChangeRequestChecksPayloadType = Schema.Schema.Type<typeof ChangeRequestChecksPayload>;

/** A new review or review-activity event on a change request. */
export const ChangeRequestReviewPayload = Schema.Struct({
  changeRequest: ChangeRequestPayload,
  reviewer: Schema.String,
  action: Schema.String,
  comment: Schema.optional(Schema.String),
  threadUrl: Schema.optional(Schema.String),
});
export type ChangeRequestReviewPayloadType = Schema.Schema.Type<typeof ChangeRequestReviewPayload>;

// ── Tier A signals ───────────────────────────────────────────────────────────

export const ScmChangeRequestMerged = defineSignal(
  "scm.change-request.merged",
  Schema.Struct({
    changeRequest: ChangeRequestPayload,
    mergedBy: Schema.optional(Schema.String),
  }),
);

export const ScmChangeRequestClosed = defineSignal(
  "scm.change-request.closed",
  Schema.Struct({
    changeRequest: ChangeRequestPayload,
  }),
);

export const ScmChangeRequestDraftReady = defineSignal(
  "scm.change-request.draft-ready",
  Schema.Struct({
    changeRequest: ChangeRequestPayload,
  }),
);

export const ScmChangeRequestChecksConcluded = defineSignal(
  "scm.change-request.checks.concluded",
  ChangeRequestChecksPayload,
);

export const ScmChangeRequestReviewActivity = defineSignal(
  "scm.change-request.review.activity",
  ChangeRequestReviewPayload,
);

// ── Tier A params ────────────────────────────────────────────────────────────

/** Shared Tier A identity: one change request in one repository of one project. */
export const ScmChangeRequestParams = Schema.Struct({
  projectId: Schema.String,
  repository: Schema.String,
  number: Schema.Number,
});
export type ScmChangeRequestParamsType = Schema.Schema.Type<typeof ScmChangeRequestParams>;

// ── Tier A source declarations ───────────────────────────────────────────────

/** Watches a change request's lifecycle: merged / closed / draft-ready. */
export const ScmChangeRequestWatch: SignalSourceRef<
  ScmChangeRequestParamsType,
  [typeof ScmChangeRequestMerged, typeof ScmChangeRequestClosed, typeof ScmChangeRequestDraftReady]
> = builtinSignalSource({
  name: "scm.change-request.watch",
  params: ScmChangeRequestParams,
  emits: [ScmChangeRequestMerged, ScmChangeRequestClosed, ScmChangeRequestDraftReady],
});

/** Watches a change request's check suite: emits on every conclusion transition. */
export const ScmChangeRequestChecks: SignalSourceRef<
  ScmChangeRequestParamsType,
  [typeof ScmChangeRequestChecksConcluded]
> = builtinSignalSource({
  name: "scm.change-request.checks",
  params: ScmChangeRequestParams,
  emits: [ScmChangeRequestChecksConcluded],
});

/** Watches a change request's review activity: new reviews, replies, and decisions. */
export const ScmChangeRequestReview: SignalSourceRef<
  ScmChangeRequestParamsType,
  [typeof ScmChangeRequestReviewActivity]
> = builtinSignalSource({
  name: "scm.change-request.review",
  params: ScmChangeRequestParams,
  emits: [ScmChangeRequestReviewActivity],
});

// ── Work-item payloads (Tier B) ──────────────────────────────────────────────

/** The neutral work-item snapshot a work-item signal carries. */
export const WorkItemPayload = Schema.Struct({
  provider: Schema.String,
  issueKey: Schema.String,
  title: Schema.String,
  url: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
  updatedAt: Schema.optional(Schema.String),
  changedFields: Schema.optional(Schema.Array(Schema.String)),
});
export type WorkItemPayloadType = Schema.Schema.Type<typeof WorkItemPayload>;

export const WorkItemUpdated = defineSignal("work-item.updated", WorkItemPayload);

/** Shared Tier B identity: one work item of one project, for one (local) account. */
export const WorkItemParams = Schema.Struct({
  projectId: Schema.String,
  issueKey: Schema.String,
  accountId: Schema.optional(Schema.String),
});
export type WorkItemParamsType = Schema.Schema.Type<typeof WorkItemParams>;

/** Watches one work item: emits on every observed field change (state, assignee, …). */
export const WorkItemUpdates: SignalSourceRef<WorkItemParamsType, [typeof WorkItemUpdated]> =
  builtinSignalSource({
    name: "work-item.updates",
    params: WorkItemParams,
    emits: [WorkItemUpdated],
  });

// ── Catalog index (host-side cross-check) ───────────────────────────────────

/** Every built-in source declaration, for the host catalog's name → declaration map.
 * `as const` (not a widened array type): a concrete declaration is not assignable to
 * `SignalSourceRef<unknown>` — the consumers only read `.name` off each entry. */
export const BUILTIN_SIGNAL_SOURCES = [
  ScmChangeRequestWatch,
  ScmChangeRequestChecks,
  ScmChangeRequestReview,
  WorkItemUpdates,
] as const;

/** Every built-in signal, keyed by name (the host's delivery trust boundary). */
export const BUILTIN_SIGNALS: ReadonlyArray<Signal<unknown>> = [
  ScmChangeRequestMerged,
  ScmChangeRequestClosed,
  ScmChangeRequestDraftReady,
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestReviewActivity,
  WorkItemUpdated,
];

/**
 * The built-in identifiers a body may reference. The loader BLANKS every import statement in a
 * workflow body, so these declarations must be bound into the body globals exactly like
 * `defineWorkflow` and the error classes — a body importing
 * `ScmChangeRequestWatch` from `@t3team/sdk` resolves it here.
 */
export const BUILTIN_SIGNAL_GLOBALS: Readonly<Record<string, unknown>> = {
  ScmChangeRequestWatch,
  ScmChangeRequestChecks,
  ScmChangeRequestReview,
  WorkItemUpdates,
  ScmChangeRequestMerged,
  ScmChangeRequestClosed,
  ScmChangeRequestDraftReady,
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestReviewActivity,
  WorkItemUpdated,
  ChangeRequestPayload,
  ChangeRequestChecksPayload,
  ChangeRequestReviewPayload,
  WorkItemPayload,
  ScmChangeRequestParams,
  WorkItemParams,
};
