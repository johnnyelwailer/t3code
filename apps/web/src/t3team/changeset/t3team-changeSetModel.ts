import {
  T3TeamMessageDraftMutationAttachment,
  WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
  WorkItemChangeSet,
  type T3TeamDraftMutationPayload,
  type T3TeamThreadArtifact,
  type WorkItemChangeSetOperation,
} from "@t3tools/contracts";
import { verifyDraftPayloadHash } from "@t3tools/shared/t3team-workItemChangeSetHash";
import * as Schema from "effect/Schema";

type ArtifactLike = Pick<T3TeamThreadArtifact, "id" | "threadId" | "kind" | "payload">;

const decodeChangeSet = Schema.decodeUnknownOption(WorkItemChangeSet);
const decodeMember = Schema.decodeUnknownOption(T3TeamMessageDraftMutationAttachment);

export type ChangeSetOperationState =
  /** The member artifact is absent, on another thread, or not a draft. */
  | "missing"
  /** The member's payload no longer matches the hash recorded when the set was proposed. */
  | "changed"
  | "draft"
  | "applied"
  | "dismissed";

export type ResolvedOperation = {
  readonly operation: WorkItemChangeSetOperation;
  readonly state: ChangeSetOperationState;
  /** The member draft, read from its own artifact on this thread; absent when `missing`. */
  readonly draft?: T3TeamDraftMutationPayload;
};

export type ResolvedChangeSet = {
  readonly changeSet: WorkItemChangeSet;
  readonly operations: ReadonlyArray<ResolvedOperation>;
};

/** Change sets on this thread, newest last. A set claiming another thread is not rendered. */
export function readThreadChangeSets(
  artifacts: ReadonlyArray<ArtifactLike>,
  threadId: string,
): ReadonlyArray<WorkItemChangeSet> {
  const sets: WorkItemChangeSet[] = [];
  for (const artifact of artifacts) {
    if (artifact.kind !== WORK_ITEM_CHANGE_SET_ARTIFACT_KIND || artifact.threadId !== threadId) {
      continue;
    }
    const decoded = decodeChangeSet(artifact.payload);
    if (decoded._tag === "Some" && decoded.value.sourceThreadId === threadId) {
      sets.push(decoded.value);
    }
  }
  return sets;
}

function resolveOperation(
  operation: WorkItemChangeSetOperation,
  byId: ReadonlyMap<string, ArtifactLike>,
  threadId: string,
): ResolvedOperation {
  const artifact = byId.get(operation.draftId);
  if (!artifact || artifact.threadId !== threadId || artifact.kind !== "draft-mutation") {
    return { operation, state: "missing" };
  }
  const member = decodeMember(artifact.payload);
  if (member._tag === "None") return { operation, state: "missing" };
  const draft = member.value.draft;
  if (draft.status === "applied" || draft.status === "dismissed") {
    return { operation, state: draft.status, draft };
  }
  return {
    operation,
    state: verifyDraftPayloadHash(draft, operation) ? "draft" : "changed",
    draft,
  };
}

export function resolveChangeSet(
  changeSet: WorkItemChangeSet,
  artifacts: ReadonlyArray<ArtifactLike>,
  threadId: string,
): ResolvedChangeSet {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  return {
    changeSet,
    operations: changeSet.operations.map((operation) =>
      resolveOperation(operation, byId, threadId),
    ),
  };
}

/**
 * Draft ids the change-set card owns, so the per-draft review does not offer them a second time.
 * A discarded set owns nothing: its members surface (or are already dismissed) on their own.
 */
export function changeSetMemberDraftIds(
  artifacts: ReadonlyArray<ArtifactLike>,
  threadId: string,
): ReadonlySet<string> {
  const owned = new Set<string>();
  for (const changeSet of readThreadChangeSets(artifacts, threadId)) {
    if (changeSet.status !== "draft") continue;
    for (const { draftId } of changeSet.operations) owned.add(draftId);
  }
  return owned;
}

export type IssueGroup = {
  readonly issueKey: string;
  readonly operations: ReadonlyArray<ResolvedOperation>;
};

/** Operations grouped by the issue the MEMBER draft targets, in order of first appearance. */
export function groupByIssue(
  operations: ReadonlyArray<ResolvedOperation>,
): ReadonlyArray<IssueGroup> {
  const groups = new Map<string, ResolvedOperation[]>();
  for (const resolved of operations) {
    const issueKey = resolved.draft?.target.issueIdOrKey ?? resolved.operation.issueKey;
    const group = groups.get(issueKey);
    if (group) group.push(resolved);
    else groups.set(issueKey, [resolved]);
  }
  return [...groups].map(([issueKey, ops]) => ({ issueKey, operations: ops }));
}

/**
 * Approved = still `draft` and not toggled off. A `changed` operation is never approved (the apply
 * would refuse it), but toggling it off still records a dismissal.
 */
export function partitionBySelection(
  operations: ReadonlyArray<ResolvedOperation>,
  rejectedDraftIds: ReadonlySet<string>,
): {
  readonly approved: ReadonlyArray<ResolvedOperation>;
  readonly rejected: ReadonlyArray<ResolvedOperation>;
} {
  const isRejected = ({ operation }: ResolvedOperation) => rejectedDraftIds.has(operation.draftId);
  return {
    approved: operations.filter((resolved) => resolved.state === "draft" && !isRejected(resolved)),
    rejected: operations.filter(
      (resolved) =>
        (resolved.state === "draft" || resolved.state === "changed") && isRejected(resolved),
    ),
  };
}
