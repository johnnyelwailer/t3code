import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);
const T3workMessageResourceKind = Schema.Literals([
  "issue",
  "ticket",
  "page",
  "pull-request",
  "epic",
]);

export const T3workMessageExternalResourceRef = Schema.Struct({
  provider: Schema.String,
  kind: T3workMessageResourceKind,
  id: Schema.String,
  parentId: Schema.optional(Schema.String),
  displayId: Schema.optional(Schema.String),
  title: Schema.String,
  description: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  issueTypeIconUrl: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  projectId: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
});
export type T3workMessageExternalResourceRef = typeof T3workMessageExternalResourceRef.Type;

export const T3workMessageResourceSnapshot = Schema.Struct({
  ref: T3workMessageExternalResourceRef,
  fetchedAt: Schema.String,
  summary: Schema.optional(Schema.String),
  fields: Schema.Record(Schema.String, Schema.Unknown),
  text: Schema.optional(Schema.String),
  raw: Schema.optional(Schema.Unknown),
});
export type T3workMessageResourceSnapshot = typeof T3workMessageResourceSnapshot.Type;

export const T3workMessageBlobRef = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  url: Schema.optional(TrimmedNonEmptyString),
  mimeType: Schema.optional(TrimmedNonEmptyString),
  sizeBytes: Schema.optional(Schema.Number),
});
export type T3workMessageBlobRef = typeof T3workMessageBlobRef.Type;

export const T3workMessageArtifactRef = Schema.Struct({
  kind: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  path: Schema.optional(TrimmedNonEmptyString),
  url: Schema.optional(TrimmedNonEmptyString),
  summary: Schema.optional(Schema.String),
});
export type T3workMessageArtifactRef = typeof T3workMessageArtifactRef.Type;

export const T3workMessageFileAttachment = Schema.Struct({
  kind: Schema.Literal("file"),
  file: T3workMessageBlobRef,
});
export type T3workMessageFileAttachment = typeof T3workMessageFileAttachment.Type;

export const T3workMessageImageAttachment = Schema.Struct({
  kind: Schema.Literal("image"),
  image: T3workMessageBlobRef,
  alt: Schema.optional(Schema.String),
});
export type T3workMessageImageAttachment = typeof T3workMessageImageAttachment.Type;

export const T3workMessageResourceAttachment = Schema.Struct({
  kind: Schema.Literal("resource"),
  resource: Schema.Union([T3workMessageExternalResourceRef, T3workMessageResourceSnapshot]),
});
export type T3workMessageResourceAttachment = typeof T3workMessageResourceAttachment.Type;

export const T3workMessageArtifactAttachment = Schema.Struct({
  kind: Schema.Literal("artifact"),
  artifact: T3workMessageArtifactRef,
});
export type T3workMessageArtifactAttachment = typeof T3workMessageArtifactAttachment.Type;

export const T3workMessageViewAttachment = Schema.Struct({
  kind: Schema.Literal("view"),
  miniappId: TrimmedNonEmptyString,
  props: JsonRecord,
});
export type T3workMessageViewAttachment = typeof T3workMessageViewAttachment.Type;

export const T3workMessageAttachment = Schema.Union([
  T3workMessageFileAttachment,
  T3workMessageImageAttachment,
  T3workMessageResourceAttachment,
  T3workMessageArtifactAttachment,
  T3workMessageViewAttachment,
]);
export type T3workMessageAttachment = typeof T3workMessageAttachment.Type;

export const T3workMessageAuthor = Schema.Struct({
  kind: Schema.Literal("system"),
  workflowRunId: Schema.optional(TrimmedNonEmptyString),
  recipeId: Schema.optional(TrimmedNonEmptyString),
  stepId: Schema.optional(TrimmedNonEmptyString),
});
export type T3workMessageAuthor = typeof T3workMessageAuthor.Type;

export const T3workMessageStatus = Schema.Literals(["active", "waiting-for-input", "completed"]);
export type T3workMessageStatus = typeof T3workMessageStatus.Type;

/**
 * Present on a user message that answers a workflow's pending `askUser` with a structured
 * value (e.g. a decision-card choice). The message `text` stays the human-readable rendering
 * of the reply; the workflow-engine reactor resolves the parked ask with `value` instead of
 * the text when this is present.
 */
export const T3workMessageWorkflowReply = Schema.Struct({
  value: Schema.Unknown,
  /** The ask this reply answers (the decision card's pending correlationId). The reactor
   * ignores a structured reply whose correlationId no longer matches the pending ask, so a
   * stale card click cannot answer a NEWER question that was validated against an older one. */
  correlationId: Schema.optional(Schema.String),
});
export type T3workMessageWorkflowReply = typeof T3workMessageWorkflowReply.Type;

export const T3workMessageExt = Schema.Struct({
  author: Schema.optional(T3workMessageAuthor),
  displayText: Schema.optional(Schema.String),
  visibleToUser: Schema.optional(Schema.Boolean),
  visibleToAgent: Schema.optional(Schema.Boolean),
  status: Schema.optional(T3workMessageStatus),
  attachments: Schema.optional(Schema.Array(T3workMessageAttachment)),
  workflowReply: Schema.optional(T3workMessageWorkflowReply),
});
export type T3workMessageExt = typeof T3workMessageExt.Type;
