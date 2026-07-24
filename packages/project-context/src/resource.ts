import * as Schema from "effect/Schema";

export const ResourceKind = Schema.Literals(["issue", "ticket", "page", "pull-request", "epic"]);
export type ResourceKind = typeof ResourceKind.Type;

export const ExternalResourceRef = Schema.Struct({
  provider: Schema.String,
  kind: ResourceKind,
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
  labels: Schema.optional(Schema.Array(Schema.String)),
});
export type ExternalResourceRef = typeof ExternalResourceRef.Type;

export const ResourceSnapshot = Schema.Struct({
  ref: ExternalResourceRef,
  fetchedAt: Schema.String,
  summary: Schema.optional(Schema.String),
  fields: Schema.Record(Schema.String, Schema.Unknown),
  text: Schema.optional(Schema.String),
  raw: Schema.optional(Schema.Unknown),
});
export type ResourceSnapshot = typeof ResourceSnapshot.Type;

export const ResourcePage = Schema.Struct({
  items: Schema.Array(ExternalResourceRef),
  nextCursor: Schema.optional(Schema.String),
  totalCount: Schema.optional(Schema.Number),
});
export type ResourcePage = typeof ResourcePage.Type;
