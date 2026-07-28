import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const T3TeamDraftMutationField = Schema.Literals([
  "assignee",
  "estimate",
  "status",
  "description",
  "comment",
  "subtask",
  "link",
]);
export type T3TeamDraftMutationField = typeof T3TeamDraftMutationField.Type;

/**
 * An agent-proposed, not-yet-applied mutation of an external work item — exactly the payload the
 * broker's `*.draft_*` tools return in `structuredContent.draftMutation`, plus a stable `id`.
 *
 * It is carried as typed message data rather than recovered from a provider's rendered tool call:
 * each adapter reshapes tool results for display (the Claude adapter does not even classify every
 * draft tool as an MCP call), so the timeline is not a transport.
 */
export const T3TeamDraftMutationPayload = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Schema.Literal("jira-work-item-draft"),
  tool: TrimmedNonEmptyString,
  target: Schema.Struct({
    provider: Schema.Literal("jira"),
    issueIdOrKey: TrimmedNonEmptyString,
  }),
  field: T3TeamDraftMutationField,
  patch: Schema.Record(Schema.String, Schema.Unknown),
  status: Schema.Literal("draft"),
  summary: Schema.optional(Schema.String),
  commitPolicy: Schema.Struct({
    requiresUserApproval: Schema.Boolean,
    commitSurface: TrimmedNonEmptyString,
  }),
});
export type T3TeamDraftMutationPayload = typeof T3TeamDraftMutationPayload.Type;

/**
 * A POINTER to a work item that has a draft waiting on its review surface — what a run's completion
 * message carries so the conversation can render a navigable card instead of prose the reader has to
 * act on themselves ("Proposed a rewritten description for NXAI-6 — review it on the work item").
 *
 * Deliberately NOT the draft itself: the proposal already travels as
 * {@link T3TeamMessageDraftMutationAttachment} on its own hidden carrier, and duplicating the patch
 * here would give the client two sources for one draft that can disagree after an accept. This says
 * only "there is something to review, and here is where" — id fields to navigate by, plus a line of
 * preview so the card means something before the user clicks.
 *
 * `summary` and `field` are optional because the producer is a workflow body's output: a body that
 * names neither still gets a working card, just a plainer one.
 */
export const T3TeamMessageWorkItemDraftRefAttachment = Schema.Struct({
  kind: Schema.Literal("work-item-draft"),
  projectId: TrimmedNonEmptyString,
  issueIdOrKey: TrimmedNonEmptyString,
  /** Which field the draft proposes, when the producer says so. Same vocabulary as the draft. */
  field: Schema.optional(T3TeamDraftMutationField),
  /** One line for the card face. */
  summary: Schema.optional(Schema.String),
});
export type T3TeamMessageWorkItemDraftRefAttachment =
  typeof T3TeamMessageWorkItemDraftRefAttachment.Type;

/**
 * Carrier for one proposed draft. The message it rides on is hidden from both the user and the
 * agent prompt; its only job is to deliver the draft to the client's review surface (and to make
 * the proposal replayable when the thread is reloaded). The proposing thread is the thread the
 * message belongs to, so no `sourceThreadId` is duplicated here.
 */
export const T3TeamMessageDraftMutationAttachment = Schema.Struct({
  kind: Schema.Literal("draft-mutation"),
  draft: T3TeamDraftMutationPayload,
});
export type T3TeamMessageDraftMutationAttachment = typeof T3TeamMessageDraftMutationAttachment.Type;
