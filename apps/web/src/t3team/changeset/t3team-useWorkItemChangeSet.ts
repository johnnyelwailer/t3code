import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";
import {
  groupByIssue,
  type ResolvedChangeSet,
  type ResolvedOperation,
} from "~/t3team/changeset/t3team-changeSetModel";
import {
  useChangeSetOutcomeStore,
  type HoldKind,
} from "~/t3team/changeset/t3team-changeSetOutcomeStore";
import {
  recordOperationVerdict,
  runChangeSet,
  type ChangeSetDeps,
} from "~/t3team/changeset/t3team-changeSetRun";
import {
  decisionOf,
  partitionBySelection,
  retryTargets,
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
  const progress = useChangeSetOutcomeStore((state) => state.running.get(resolved.changeSet.id));
  const changeSetId = resolved.changeSet.id;
  // Only this set's entries are selected, so a result in another card does not re-render this one.
  const memberIds = resolved.operations.map((op) => op.operation.draftId);
  const slice = useChangeSetOutcomeStore(
    useShallow((state) => memberIds.flatMap((id) => [state.outcomes.get(id), state.held.get(id)])),
  );
  const outcomes = new Map<string, OperationOutcome>();
  const held = new Map<string, HoldKind>();
  memberIds.forEach((id, index) => {
    const outcome = slice[index * 2] as OperationOutcome | undefined;
    const hold = slice[index * 2 + 1] as HoldKind | undefined;
    if (outcome) outcomes.set(id, outcome);
    if (hold) held.set(id, hold);
  });

  // This session's verdict counts before the artifact stream catches up: nothing is sent twice.
  const operations = resolved.operations.map((op): ResolvedOperation => {
    const outcome = outcomes.get(op.operation.draftId);
    return isStatus(outcome, "applied", "dismissed") && op.state !== "duplicate"
      ? { ...op, state: outcome?.status === "applied" ? "applied" : "dismissed" }
      : op;
  });
  const selection = partitionBySelection(operations, overrides, new Set(held.keys()));
  const retry = retryTargets(selection, operations, outcomes, new Set(held.keys()));
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
    failedCount: retry.approved.length + retry.rejected.length,
    held,
    uncertainCount: [...held.values()].filter((kind) => kind === "uncertain").length,
    unrecordedCount: [...held.values()].filter((kind) => kind === "unrecorded").length,
    unavailableReason: deps.acceptOp ? undefined : deps.unavailableReason,
    discardError,
    toggle: (op: ResolvedOperation) =>
      setOverrides((current) =>
        new Map(current).set(op.operation.draftId, toggledDecision(op, current)),
      ),
    apply: () => run(selection.approved, selection.rejected),
    retryFailed: () => run(retry.approved, retry.rejected),
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
