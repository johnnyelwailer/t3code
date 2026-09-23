/**
 * The "awaiting parent" fact — a plan-mode thread whose latest turn settled
 * cleanly and which still carries an actionable (unimplemented) proposed
 * plan: it stopped after presenting its plan and the parent owes it a
 * decision.
 *
 * Kept out of `t3team-threadRunStatus.ts` (the 200-line t3team-prefix cap)
 * but derived there: `deriveThreadRunStatus` applies `deriveThreadAwaitingParent`
 * over the same shell fields, so the children tool (list/status), the
 * parent-side panel indicator, and any future surface apply ONE predicate.
 *
 * `threadHasActionableProposedPlan` is the detail-load twin of the shell's
 * `hasActionableProposedPlan` flag: it folds the thread's durable proposed-
 * plan records into the SAME fact (newest-first by updatedAt, the latest
 * turn's own plan deciding when it has one) — the precedence the projection
 * uses to fill the shell column, so live shells and detail loads can never
 * disagree. No child cooperation is involved anywhere: the plan records are
 * written by provider ingestion and consumed by the approval-implementation
 * flow, so a stuck plan-mode child cannot fail to set the fact.
 *
 * @module threadAwaitingParent
 */

/**
 * The "awaiting parent" predicate: plan-mode thread + cleanly settled latest
 * turn + an actionable proposed plan (one the provider recorded that no
 * approval-implementation turn has consumed yet).
 */
export function deriveThreadAwaitingParent(input: {
  readonly interactionMode?: string | null | undefined;
  readonly latestTurn: { readonly state: string } | null;
  readonly hasActionableProposedPlan?: boolean | undefined;
}): boolean {
  return (
    input.interactionMode === "plan" &&
    input.latestTurn !== null &&
    input.latestTurn.state === "completed" &&
    input.hasActionableProposedPlan === true
  );
}

/**
 * The actionable-plan fact from a thread's PROPOSED-PLAN records (the detail
 * load's view of the shell's `hasActionableProposedPlan` flag): true when the
 * latest turn owns a plan and that plan is unimplemented, else when the
 * thread's newest plan is unimplemented. Newest-first by updatedAt, id as
 * tiebreak — the SAME precedence the projection uses to fill the shell
 * column, so the status op and the live shell can never disagree.
 */
export function threadHasActionableProposedPlan(
  latestTurn: { readonly turnId?: string | null } | null,
  proposedPlans:
    | ReadonlyArray<{
        readonly id: string;
        readonly turnId: string | null;
        readonly implementedAt: string | null;
        readonly updatedAt: string;
      }>
    | undefined,
): boolean {
  if (proposedPlans === undefined || proposedPlans.length === 0) return false;
  const sorted = [...proposedPlans].toSorted(
    (left, right) =>
      left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
  );
  const latestTurnId = latestTurn?.turnId ?? null;
  let forLatestTurn: { readonly implementedAt: string | null } | null = null;
  if (latestTurnId !== null) {
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const plan = sorted[index];
      if (plan?.turnId === latestTurnId) {
        forLatestTurn = plan;
        break;
      }
    }
  }
  if (forLatestTurn !== null) {
    return forLatestTurn.implementedAt === null;
  }
  const newest = sorted.at(-1) ?? null;
  return newest !== null && newest.implementedAt === null;
}
