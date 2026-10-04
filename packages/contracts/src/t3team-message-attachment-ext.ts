/**
 * t3team message attachment schemas: the resource/file/image/widget/view
 * attachment structs and the `T3TeamMessageAttachment` union they feed.
 * Split out of t3team-message-ext.ts so each file stays under the additive
 * guard's 200 non-empty line ceiling.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  T3TeamMessageDraftMutationAttachment,
  T3TeamMessageWorkItemDraftRefAttachment,
} from "./t3team-draft-mutation.ts";

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
