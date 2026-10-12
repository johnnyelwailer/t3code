import * as Schema from "effect/Schema";
import * as HttpServerRespondable from "effect/http/HttpServerRespondable";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { PullRequestRef } from "./pullRequest.ts";

/**
 * The roster's one reference. A work item shows the threads that claim it (and, once U3 lands,
 * attach to it); a pull request shows the threads linked to it. Both answer as a flat roster of
 * rows the client merges against its live thread shells for grouping.
 */
export const ReferenceWorkItemInput = Schema.Struct({
  kind: Schema.Literal("work-item"),
  projectId: ProjectId,
  ticketId: TrimmedNonEmptyString,
});
export type ReferenceWorkItemInput = typeof ReferenceWorkItemInput.Type;

export const ReferencePullRequestInput = Schema.Struct({
  kind: Schema.Literal("pull-request"),
  ref: PullRequestRef,
});
export type ReferencePullRequestInput = typeof ReferencePullRequestInput.Type;

export const ReferenceLinkedThreadsInput = Schema.Union([
  ReferenceWorkItemInput,
  ReferencePullRequestInput,
]);
export type ReferenceLinkedThreadsInput = typeof ReferenceLinkedThreadsInput.Type;

/** How a thread relates to the reference: explicitly linked, or claimed as its active work. */
export const ReferenceThreadSource = Schema.Literals(["linked", "claimed"]);
export type ReferenceThreadSource = typeof ReferenceThreadSource.Type;

export const ReferenceLinkedThreadRow = Schema.Struct({
  id: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  archivedAt: Schema.NullOr(IsoDateTime),
  source: ReferenceThreadSource,
});
export type ReferenceLinkedThreadRow = typeof ReferenceLinkedThreadRow.Type;

export const ReferenceLinkedThreadsResult = Schema.Struct({
  threads: Schema.Array(ReferenceLinkedThreadRow),
});
export type ReferenceLinkedThreadsResult = typeof ReferenceLinkedThreadsResult.Type;

export class ReferenceOperationError extends Schema.TaggedError<ReferenceOperationError>()(
  "ReferenceOperationError",
  {
    operation: Schema.String,
    detail: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
  { httpApiStatus: 502 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(ReferenceOperationError)(this, { status: 502 });
  }

  override get message(): string {
    return `References ${this.operation} failed: ${this.detail}`;
  }
}
