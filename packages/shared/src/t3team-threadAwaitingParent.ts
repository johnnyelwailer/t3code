/**
 * The "awaiting parent" fact — a plan-mode thread whose latest run settled
 * cleanly and which still carries an actionable (unimplemented) proposed plan:
 * it stopped after presenting its plan and the parent owes it a decision.
 *
 * Kept beside `t3team-threadRunStatus.ts`, which applies it, so the child
 * tools, the parent-side indicator and any future surface apply ONE predicate.
 * The V2 thread shell already carries `hasActionableProposedPlan`.
 *
 * @module threadAwaitingParent
 */

export function deriveThreadAwaitingParent(input: {
  readonly interactionMode?: string | null | undefined;
  /** The latest run's shell status (`idle` when no run exists). */
  readonly latestRunStatus: string;
  readonly hasActionableProposedPlan?: boolean | undefined;
}): boolean {
  return (
    input.interactionMode === "plan" &&
    input.latestRunStatus === "completed" &&
    input.hasActionableProposedPlan === true
  );
}
