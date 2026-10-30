import type { ResolvedOperation } from "~/t3team/changeset/t3team-changeSetModel";
import { operationPolicy } from "~/t3team/changeset/t3team-changeSetPolicy";

export type Decision = "approve" | "reject" | "undecided";

/** The reviewer's explicit choices; an operation without one takes its policy's default. */
export type DecisionOverrides = ReadonlyMap<string, Decision>;

/** A `draft` the card can write; a changed, missing or item-view-only operation can only be dismissed. */
export const isApprovable = (resolved: ResolvedOperation) =>
  resolved.state === "draft" && operationPolicy(resolved.draft).applicable;

export function decisionOf(resolved: ResolvedOperation, overrides: DecisionOverrides): Decision {
  const chosen = overrides.get(resolved.operation.draftId);
  if (chosen) return chosen;
  return isApprovable(resolved) && operationPolicy(resolved.draft).defaultApproved
    ? "approve"
    : "undecided";
}

/** The tick: an approvable operation flips approve and back; any other flips dismiss and keep. */
export function toggledDecision(
  resolved: ResolvedOperation,
  overrides: DecisionOverrides,
): Decision {
  const current = decisionOf(resolved, overrides);
  if (!isApprovable(resolved)) return current === "reject" ? "undecided" : "reject";
  if (current === "approve") {
    return operationPolicy(resolved.draft).defaultApproved ? "reject" : "undecided";
  }
  return "approve";
}

export function applyButtonLabel(approved: number, dismissed: number): string {
  if (approved > 0 && dismissed > 0) return `Apply ${approved} and dismiss ${dismissed}`;
  if (approved > 0) return `Apply ${approved}`;
  return dismissed > 0 ? `Dismiss ${dismissed}` : "Nothing to apply";
}

const isOpen = ({ state }: ResolvedOperation) => state === "draft" || state === "changed";

/**
 * Approved = a `draft` the reviewer approves and the card can write. Rejected = an open operation the
 * reviewer dismissed. `held` ids (written but unconfirmed, or unrecorded) are never sent again.
 */
export function partitionBySelection(
  operations: ReadonlyArray<ResolvedOperation>,
  overrides: DecisionOverrides,
  held: ReadonlySet<string> = new Set(),
): {
  readonly approved: ReadonlyArray<ResolvedOperation>;
  readonly rejected: ReadonlyArray<ResolvedOperation>;
} {
  const free = operations.filter(({ operation }) => !held.has(operation.draftId));
  return {
    approved: free.filter(
      (resolved) => isApprovable(resolved) && decisionOf(resolved, overrides) === "approve",
    ),
    rejected: free.filter(
      (resolved) => isOpen(resolved) && decisionOf(resolved, overrides) === "reject",
    ),
  };
}
