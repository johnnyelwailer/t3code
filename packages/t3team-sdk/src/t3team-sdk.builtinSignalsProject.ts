/**
 * The project-scope repository source: every issue and change request in the repositories the
 * project links (its own and its linked repositories), from one search per host per poll. An
 * optional `query` (the host's search qualifiers, e.g. `is:issue label:bug`) narrows it; it is part
 * of the instance identity, so two triggers with the same scope share one poll.
 *
 * Unlike the viewer source this is not about the viewer: anyone's issue or change request counts.
 * `authorAssociation` is the host's raw enum where it says one (GitHub today), so a policy can
 * refuse strangers; a host that cannot say omits it, which must read as "unknown".
 */

import * as Schema from "effect/Schema";

import { builtinSignalSource, defineSignal, type SignalSourceRef } from "./t3team-sdk.signal.ts";

/** A project, optionally narrowed by a provider query. Shared by the project-scope sources. */
export const ProjectScopeParams = Schema.Struct({
  projectId: Schema.String,
  query: Schema.optional(Schema.String),
});
export type ProjectScopeParamsType = Schema.Schema.Type<typeof ProjectScopeParams>;

export const ScmProjectItemPayload = Schema.Struct({
  kind: Schema.Literals(["issue", "change-request"]),
  provider: Schema.String,
  host: Schema.String,
  repository: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  state: Schema.Literals(["open", "closed", "merged"]),
  isDraft: Schema.optional(Schema.Boolean),
  author: Schema.optional(Schema.String),
  authorAssociation: Schema.optional(Schema.String),
  labels: Schema.Array(Schema.String),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.String,
});
export type ScmProjectItemPayloadType = Schema.Schema.Type<typeof ScmProjectItemPayload>;

/** Why it fired: `opened` is new since the source started watching; the rest are transitions. */
export const ScmProjectItemReason = Schema.Literals([
  "opened",
  "updated",
  "closed",
  "reopened",
  "merged",
]);

export const ScmProjectItemUpdated = defineSignal(
  "scm.project.item.updated",
  Schema.Struct({ item: ScmProjectItemPayload, reason: ScmProjectItemReason }),
);

export const ScmProjectItems: SignalSourceRef<
  ProjectScopeParamsType,
  [typeof ScmProjectItemUpdated]
> = builtinSignalSource({
  name: "scm.project.items",
  params: ProjectScopeParams,
  emits: [ScmProjectItemUpdated],
});
