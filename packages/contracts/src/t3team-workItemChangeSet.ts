import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  T3TeamDraftMutationField,
  type T3TeamDraftMutationPayload,
} from "./t3team-draft-mutation.ts";
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
  ),
});
export type WorkItemChangeSet = typeof WorkItemChangeSet.Type;

/** What a hash covers: everything an applying client acts on. */
type HashedDraft = Pick<T3TeamDraftMutationPayload, "target" | "field" | "patch">;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export async function hashDraftPayload(draft: HashedDraft): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalJson({ target: draft.target, field: draft.field, patch: draft.patch }),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** False when the draft differs from what the change set recorded: do not apply it. */
export async function verifyDraftPayloadHash(
  draft: HashedDraft,
  operation: Pick<WorkItemChangeSetOperation, "payloadHash">,
): Promise<boolean> {
  return (await hashDraftPayload(draft)) === operation.payloadHash;
}

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
