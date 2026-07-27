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
