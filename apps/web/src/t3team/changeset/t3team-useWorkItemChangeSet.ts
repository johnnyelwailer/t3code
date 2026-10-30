import { useState } from "react";

import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";
import {
  groupByIssue,
  type ResolvedChangeSet,
  type ResolvedOperation,
} from "~/t3team/changeset/t3team-changeSetModel";
import { useChangeSetOutcomeStore } from "~/t3team/changeset/t3team-changeSetOutcomeStore";
import {
  recordOperationVerdict,
  runChangeSet,
  type ChangeSetDeps,
} from "~/t3team/changeset/t3team-changeSetRun";
import {
  decisionOf,
  partitionBySelection,
  toggledDecision,
  type Decision,
} from "~/t3team/changeset/t3team-changeSetSelection";

const isStatus = (
  outcome: OperationOutcome | undefined,
  ...statuses: Array<OperationOutcome["status"]>
) => outcome !== undefined && statuses.includes(outcome.status);

/** Decisions, apply progress, per-operation outcomes and discard for one change set. */
export function useWorkItemChangeSet(resolved: ResolvedChangeSet, deps: ChangeSetDeps) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Decision>>(() => new Map());
  const [discardError, setDiscardError] = useState<string | null>(null);
  const outcomes = useChangeSetOutcomeStore((state) => state.outcomes);
  const progress = useChangeSetOutcomeStore((state) => state.running.get(resolved.changeSet.id));
  const changeSetId = resolved.changeSet.id;

  // This session's verdict counts before the artifact stream catches up: nothing is sent twice.
  const operations = resolved.operations.map((op): ResolvedOperation => {
    const outcome = outcomes.get(op.operation.draftId);
    return isStatus(outcome, "applied", "dismissed") && op.state !== "duplicate"
      ? { ...op, state: outcome?.status === "applied" ? "applied" : "dismissed" }
      : op;
  });
  const outcomeOf = (op: ResolvedOperation) => outcomes.get(op.operation.draftId);
  const held = new Set(
    operations
      .filter((op) => isStatus(outcomeOf(op), "uncertain", "unrecorded"))
      .map((op) => op.operation.draftId),
  );
  const selection = partitionBySelection(operations, overrides, held);
  const retryable = operations.filter((op) => isStatus(outcomeOf(op), "failed", "blocked"));
  const retryIds = new Set(retryable.map((op) => op.operation.draftId));
  const run = (
    approved: ReadonlyArray<ResolvedOperation>,
    rejected: ReadonlyArray<ResolvedOperation>,
  ) => runChangeSet({ changeSetId, deps, approved, rejected });
  const find = (draftId: string) => operations.find((op) => op.operation.draftId === draftId);

  return {
    groups: groupByIssue(operations),
    total: operations.length,
    open: operations.some(({ state }) => state === "draft" || state === "changed"),
    outcomes,
    progress,
    decisionOf: (op: ResolvedOperation) => decisionOf(op, overrides),
    approvedCount: selection.approved.length,
    dismissCount: selection.rejected.length,
    failedCount: retryable.length,
    uncertainCount: operations.filter((op) => isStatus(outcomeOf(op), "uncertain")).length,
    unrecordedCount: operations.filter((op) => isStatus(outcomeOf(op), "unrecorded")).length,
    unavailableReason: deps.acceptOp ? undefined : deps.unavailableReason,
    discardError,
    toggle: (op: ResolvedOperation) =>
      setOverrides((current) =>
        new Map(current).set(op.operation.draftId, toggledDecision(op, current)),
      ),
    apply: () => run(selection.approved, selection.rejected),
    retryFailed: () =>
      run(
        selection.approved.filter((op) => retryIds.has(op.operation.draftId)),
        [],
      ),
    retryAnyway: (draftId: string) => {
      const op = find(draftId);
      return op ? run([op], []) : Promise.resolve();
    },
    markApplied: (draftId: string) => recordOperationVerdict(deps, draftId, "applied"),
    dismiss: (draftId: string) => recordOperationVerdict(deps, draftId, "dismissed"),
    discard: async () => {
      setDiscardError(null);
      try {
        await deps.recordDiscard(changeSetId);
      } catch (cause) {
        setDiscardError(cause instanceof Error ? cause.message : String(cause));
      }
    },
  };
}
