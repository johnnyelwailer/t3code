import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  T3TeamMessageDraftMutationAttachment,
  T3TeamMessageWorkItemDraftRefAttachment,
} from "./t3team-draft-mutation.ts";
// WHO wrote a message lives in its own module (see t3team-message-author.ts); re-exported here so
// `T3TeamMessageExt`'s neighbours keep resolving from one place.
import { T3TeamMessageAuthor } from "./t3team-message-author.ts";

export {
  T3TeamMessageActorAuthor,
  T3TeamMessageAuthor,
  T3TeamMessageSystemAuthor,
  T3TeamMessageWorkflowAuthor,
} from "./t3team-message-author.ts";

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);
const T3TeamMessageResourceKind = Schema.Literals([
  "issue",
  "ticket",
  "page",
  "pull-request",
  "epic",
]);

export const T3TeamMessageExternalResourceRef = Schema.Struct({
  provider: Schema.String,
  kind: T3TeamMessageResourceKind,
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
export type T3TeamMessageExternalResourceRef = typeof T3TeamMessageExternalResourceRef.Type;

export const T3TeamMessageResourceSnapshot = Schema.Struct({
  ref: T3TeamMessageExternalResourceRef,
  fetchedAt: Schema.String,
  summary: Schema.optional(Schema.String),
  fields: Schema.Record(Schema.String, Schema.Unknown),
  text: Schema.optional(Schema.String),
  raw: Schema.optional(Schema.Unknown),
});
export type T3TeamMessageResourceSnapshot = typeof T3TeamMessageResourceSnapshot.Type;

export const T3TeamMessageBlobRef = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  url: Schema.optional(TrimmedNonEmptyString),
  mimeType: Schema.optional(TrimmedNonEmptyString),
  sizeBytes: Schema.optional(Schema.Number),
});
export type T3TeamMessageBlobRef = typeof T3TeamMessageBlobRef.Type;

export const T3TeamMessageArtifactRef = Schema.Struct({
  kind: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  path: Schema.optional(TrimmedNonEmptyString),
  url: Schema.optional(TrimmedNonEmptyString),
  summary: Schema.optional(Schema.String),
});
export type T3TeamMessageArtifactRef = typeof T3TeamMessageArtifactRef.Type;

export const T3TeamMessageFileAttachment = Schema.Struct({
  kind: Schema.Literal("file"),
  file: T3TeamMessageBlobRef,
});
export type T3TeamMessageFileAttachment = typeof T3TeamMessageFileAttachment.Type;

export const T3TeamMessageImageAttachment = Schema.Struct({
  kind: Schema.Literal("image"),
  image: T3TeamMessageBlobRef,
  alt: Schema.optional(Schema.String),
});
export type T3TeamMessageImageAttachment = typeof T3TeamMessageImageAttachment.Type;

export const T3TeamMessageResourceAttachment = Schema.Struct({
  kind: Schema.Literal("resource"),
  resource: Schema.Union([T3TeamMessageExternalResourceRef, T3TeamMessageResourceSnapshot]),
});
export type T3TeamMessageResourceAttachment = typeof T3TeamMessageResourceAttachment.Type;

export const T3TeamMessageArtifactAttachment = Schema.Struct({
  kind: Schema.Literal("artifact"),
  artifact: T3TeamMessageArtifactRef,
});
export type T3TeamMessageArtifactAttachment = typeof T3TeamMessageArtifactAttachment.Type;

/** Broker tool names an ad-hoc widget's runtime bridge may call. Empty/omitted = no tool access. */
export const T3TeamWidgetCapabilities = Schema.Struct({
  tools: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type T3TeamWidgetCapabilities = typeof T3TeamWidgetCapabilities.Type;

/**
 * An ad-hoc, model-authored widget (Epic 24 ephemeral tier). The sibling of the first-party
 * `view` kind: `view` renders a registered miniapp with typed props; `widget` renders raw
 * agent-supplied SVG/HTML in a sandboxed iframe. The widget body is persisted as an Epic 08
 * RichArtifact (format html) — `artifact` is that durable ref; `html` is the render payload.
 */
export const T3TeamMessageWidgetAttachment = Schema.Struct({
  kind: Schema.Literal("widget"),
  widget: Schema.Struct({
    widgetId: TrimmedNonEmptyString,
    title: TrimmedNonEmptyString,
    /** Tier pipeline the widget body targets. Only html/svg render today (sandboxed iframe);
     * mdx/tsx are reserved for the T1 safe-mdx renderer and T2b compose pipeline. */
    format: Schema.Literals(["html", "svg", "mdx", "tsx"]),
    html: Schema.String,
    artifact: Schema.optional(T3TeamMessageArtifactRef),
    capabilities: Schema.optional(T3TeamWidgetCapabilities),
    loadingMessages: Schema.optional(Schema.Array(Schema.String)),
  }),
});
export type T3TeamMessageWidgetAttachment = typeof T3TeamMessageWidgetAttachment.Type;

export const T3TeamMessageViewAttachment = Schema.Struct({
  kind: Schema.Literal("view"),
  miniappId: TrimmedNonEmptyString,
  props: JsonRecord,
});
export type T3TeamMessageViewAttachment = typeof T3TeamMessageViewAttachment.Type;

export const T3TeamMessageAttachment = Schema.Union([
  T3TeamMessageFileAttachment,
  T3TeamMessageImageAttachment,
  T3TeamMessageResourceAttachment,
  T3TeamMessageArtifactAttachment,
  T3TeamMessageViewAttachment,
  T3TeamMessageWidgetAttachment,
  T3TeamMessageDraftMutationAttachment,
  T3TeamMessageWorkItemDraftRefAttachment,
]);
export type T3TeamMessageAttachment = typeof T3TeamMessageAttachment.Type;

export const T3TeamActorMessageUrgency = Schema.Literals(["normal", "urgent"]);
export type T3TeamActorMessageUrgency = typeof T3TeamActorMessageUrgency.Type;

/**
 * Inter-agent delivery metadata carried on an `actor`-role message.
 * `hopCount` / `rootThreadId` back the loop guard (a chain of auto-reactions
 * cannot run away); `senderThreadId` lets the receiving agent address a reply.
 */
export const T3TeamActorMessageInfo = Schema.Struct({
  senderThreadId: Schema.String,
  urgency: T3TeamActorMessageUrgency,
  hopCount: Schema.Number,
  rootThreadId: Schema.String,
});
export type T3TeamActorMessageInfo = typeof T3TeamActorMessageInfo.Type;

export const T3TeamMessageStatus = Schema.Literals(["active", "waiting-for-input", "completed"]);
export type T3TeamMessageStatus = typeof T3TeamMessageStatus.Type;

/**
 * Present on a user message that answers a workflow's pending `askUser` with a structured
 * value (e.g. a decision-card choice). The message `text` stays the human-readable rendering
 * of the reply; the workflow-engine reactor resolves the parked ask with `value` instead of
 * the text when this is present.
 */
export const T3TeamMessageWorkflowReply = Schema.Struct({
  value: Schema.Unknown,
  /** The ask this reply answers (the decision card's pending correlationId). The reactor
   * ignores a structured reply whose correlationId no longer matches the pending ask, so a
   * stale card click cannot answer a NEWER question that was validated against an older one. */
  correlationId: Schema.optional(Schema.String),
});
export type T3TeamMessageWorkflowReply = typeof T3TeamMessageWorkflowReply.Type;

/**
 * Metadata for a user action emitted by an inline widget. The action starts a normal agent turn,
 * but it is transport rather than a direct reply to a parked workflow `askUser`; the workflow
 * reactor therefore must not consume it as pending input.
 */
export const T3TeamMessageWidgetReply = Schema.Struct({
  widgetId: TrimmedNonEmptyString,
  widgetTitle: TrimmedNonEmptyString,
});
export type T3TeamMessageWidgetReply = typeof T3TeamMessageWidgetReply.Type;

export const T3TeamMessageExt = Schema.Struct({
  author: Schema.optional(T3TeamMessageAuthor),
  displayText: Schema.optional(Schema.String),
  visibleToUser: Schema.optional(Schema.Boolean),
  visibleToAgent: Schema.optional(Schema.Boolean),
  status: Schema.optional(T3TeamMessageStatus),
  attachments: Schema.optional(Schema.Array(T3TeamMessageAttachment)),
  workflowReply: Schema.optional(T3TeamMessageWorkflowReply),
  widgetReply: Schema.optional(T3TeamMessageWidgetReply),
  /** Present on an `actor`-role message (inter-agent coordination). */
  actor: Schema.optional(T3TeamActorMessageInfo),
});
export type T3TeamMessageExt = typeof T3TeamMessageExt.Type;
