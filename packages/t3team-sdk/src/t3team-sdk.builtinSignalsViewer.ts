/**
 * The viewer's own change-request source (S5a) — one instance per project, watching the open
 * change requests the viewer wrote or was asked to review, across every repository the project
 * links. Unlike the Tier A sources (one change request each) it spans many, so each event is keyed
 * by its change request.
 *
 * The payload carries what a policy needs to decide "launch or not" without a second read:
 * `isCrossRepository` + `authorAssociation` say whether a head comes from a stranger's fork,
 * `viewerAuthored` says whose it is. A host that cannot say `authorAssociation` omits it, which a
 * policy must read as "unknown", never as "trusted". `authorAssociation` is GitHub's raw enum, so a
 * `select` on it is GitHub-only today.
 */

import * as Schema from "effect/Schema";

import { builtinSignalSource, defineSignal, type SignalSourceRef } from "./t3team-sdk.signal.ts";

/** The change request an event is about, in the neutral vocabulary (no provider shape). */
export const ViewerChangeRequestPayload = Schema.Struct({
  provider: Schema.String,
  host: Schema.String,
  repository: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  baseRef: Schema.optional(Schema.String),
  headRef: Schema.optional(Schema.String),
  isDraft: Schema.Boolean,
  /** The head lives in another repository (a fork). Unknown is reported as `true`. */
  isCrossRepository: Schema.Boolean,
  /**
   * The author's standing on the repository, if the host says. This is GitHub's raw enum (OWNER,
   * MEMBER, COLLABORATOR, CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR, NONE, …): a `select` on it is
   * GitHub-only today, and other hosts omit it.
   */
  authorAssociation: Schema.optional(Schema.String),
  viewerAuthored: Schema.Boolean,
});
export type ViewerChangeRequestPayloadType = Schema.Schema.Type<typeof ViewerChangeRequestPayload>;

/** Why the event fired. `pushed` is only ever emitted for a viewer-authored change request. */
export const ViewerChangeRequestReason = Schema.Literals(["review-requested", "pushed", "opened"]);
export type ViewerChangeRequestReasonType = Schema.Schema.Type<typeof ViewerChangeRequestReason>;

export const ScmViewerChangeRequestUpdatedPayload = Schema.Struct({
  changeRequest: ViewerChangeRequestPayload,
  headSha: Schema.optional(Schema.String),
  baseSha: Schema.optional(Schema.String),
  changedFiles: Schema.Number,
  additions: Schema.Number,
  deletions: Schema.Number,
  reason: ViewerChangeRequestReason,
});
export type ScmViewerChangeRequestUpdatedPayload = Schema.Schema.Type<
  typeof ScmViewerChangeRequestUpdatedPayload
>;

export const ScmViewerChangeRequestUpdated = defineSignal(
  "scm.viewer.change-request.updated",
  ScmViewerChangeRequestUpdatedPayload,
);

/** Identity is the project alone: the project decides which repositories are in scope. */
export const ScmViewerChangeRequestsParams = Schema.Struct({ projectId: Schema.String });
export type ScmViewerChangeRequestsParamsType = Schema.Schema.Type<
  typeof ScmViewerChangeRequestsParams
>;

export const ScmViewerChangeRequests: SignalSourceRef<
  ScmViewerChangeRequestsParamsType,
  [typeof ScmViewerChangeRequestUpdated]
> = builtinSignalSource({
  name: "scm.viewer.change-requests",
  params: ScmViewerChangeRequestsParams,
  emits: [ScmViewerChangeRequestUpdated],
});
