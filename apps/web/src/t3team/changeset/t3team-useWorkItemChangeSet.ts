import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { useState } from "react";

import {
  applyChangeSetOperations,
  type ApplyDeps,
  type OperationOutcome,
} from "~/t3team/changeset/t3team-changeSetApply";
import {
  groupByIssue,
  partitionBySelection,
  type ResolvedChangeSet,
} from "~/t3team/changeset/t3team-changeSetModel";

export type ChangeSetDeps = {
  /** Absent without a connected Atlassian account: the set can be reviewed and rejected, not applied. */
  readonly acceptOp?: (draft: T3TeamDraftMutationPayload) => Promise<void>;
  readonly record: ApplyDeps["record"];
  readonly recordDiscard: (changeSetId: string) => Promise<void>;
};

const RETRYABLE: ReadonlySet<OperationOutcome["status"]> = new Set([
  "failed",
  "blocked",
  "unrecorded",
]);

/** Selection, apply progress, per-operation outcomes and discard for one change set. */
export function useWorkItemChangeSet(resolved: ResolvedChangeSet, deps: ChangeSetDeps) {
  const [rejected, setRejected] = useState<ReadonlySet<string>>(() => new Set());
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, OperationOutcome>>(() => new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);

  // This session's verdict counts before the artifact stream catches up: no operation is sent twice.
  const operations = resolved.operations.map((op) => {
    const status = outcomes.get(op.operation.draftId)?.status;
    return status === "applied" || status === "dismissed" ? { ...op, state: status } : op;
  });
  const selection = partitionBySelection(operations, rejected);
  const retryable = operations.filter(({ operation }) => {
    const status = outcomes.get(operation.draftId)?.status;
    return status !== undefined && RETRYABLE.has(status);
  });
  const retryIds = new Set(retryable.map(({ operation }) => operation.draftId));

  async function run(only?: ReadonlySet<string>) {
    const { acceptOp } = deps;
    if (!acceptOp || progress) return;
    const keep = ({ operation }: { operation: { draftId: string } }) =>
      only === undefined || only.has(operation.draftId);
    const approved = selection.approved.filter(keep);
    const toDismiss = selection.rejected.filter(keep);
    const unrecorded = new Set(
      [...outcomes].filter(([, { status }]) => status === "unrecorded").map(([id]) => id),
    );
    setProgress({ done: 0, total: approved.length + toDismiss.length });
    try {
      const results = await applyChangeSetOperations({
        approved,
        rejected: toDismiss,
        unrecordedDraftIds: unrecorded,
        acceptOp,
        record: deps.record,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setOutcomes(
        (current) => new Map([...current, ...results.map((r) => [r.draftId, r] as const)]),
      );
    } finally {
      setProgress(null);
    }
  }

  async function discard() {
    setDiscardError(null);
    try {
      await deps.recordDiscard(resolved.changeSet.id);
    } catch (cause) {
      setDiscardError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function toggle(draftId: string) {
    setRejected((current) => {
      const next = new Set(current);
      if (!next.delete(draftId)) next.add(draftId);
      return next;
    });
  }

  return {
    groups: groupByIssue(operations),
    total: operations.length,
    open: operations.some(({ state }) => state === "draft" || state === "changed"),
    rejected,
    outcomes,
    progress,
    approvedCount: selection.approved.length,
    rejectedCount: selection.rejected.length,
    failedCount: retryable.length,
    canApply: deps.acceptOp !== undefined,
    discardError,
    toggle,
    apply: () => run(),
    retryFailed: () => run(retryIds),
    discard,
  };
}
