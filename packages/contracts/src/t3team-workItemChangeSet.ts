import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { T3TeamDraftMutationField } from "./t3team-draft-mutation.ts";
import type { T3TeamThreadArtifact } from "./t3team-threadArtifacts.ts";

/** Artifact kind of a change-set carrier in the thread artifacts store. */
export const WORK_ITEM_CHANGE_SET_ARTIFACT_KIND = "work-item-change-set";

export const WORK_ITEM_CHANGE_SET_MAX_OPERATIONS = 25;

/** `draft` until the reviewer discards it; applying is per operation, on the member drafts. */
export const WorkItemChangeSetStatus = Schema.Literals(["draft", "discarded"]);
export type WorkItemChangeSetStatus = typeof WorkItemChangeSetStatus.Type;

export const WorkItemChangeSetOperation = Schema.Struct({
  /** Id of the member `draft-mutation` artifact; its status is the operation's status. */
  draftId: TrimmedNonEmptyString,
  issueKey: TrimmedNonEmptyString,
  field: T3TeamDraftMutationField,
  summary: Schema.String,
  /** SHA-256 hex of the draft's target, field and patch at publish time. */
  payloadHash: TrimmedNonEmptyString,
});
export type WorkItemChangeSetOperation = typeof WorkItemChangeSetOperation.Type;

/** The payload of a `work-item-change-set` thread artifact (artifact id = `id`). */
export const WorkItemChangeSet = Schema.Struct({
  kind: Schema.Literal(WORK_ITEM_CHANGE_SET_ARTIFACT_KIND),
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  sourceThreadId: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  status: WorkItemChangeSetStatus,
  operations: Schema.Array(WorkItemChangeSetOperation).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(WORK_ITEM_CHANGE_SET_MAX_OPERATIONS),
    Schema.makeFilter(
      (operations: ReadonlyArray<WorkItemChangeSetOperation>) =>
        new Set(operations.map(({ draftId }) => draftId)).size === operations.length ||
        "Each operation needs its own draftId.",
    ),
  ),
});
export type WorkItemChangeSet = typeof WorkItemChangeSet.Type;

/** Each operation's draft status, read from the member artifacts; `missing` if one was removed. */
export function readWorkItemChangeSetOperationStatuses(
  changeSet: Pick<WorkItemChangeSet, "operations">,
  artifacts: ReadonlyArray<Pick<T3TeamThreadArtifact, "id" | "payload">>,
): ReadonlyArray<{ readonly draftId: string; readonly status: string }> {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact.payload]));
  return changeSet.operations.map(({ draftId }) => {
    const payload = byId.get(draftId) as
      | { readonly draft?: { readonly status?: unknown } }
      | undefined;
    const status = payload?.draft?.status;
    return { draftId, status: typeof status === "string" ? status : "missing" };
  });
}
