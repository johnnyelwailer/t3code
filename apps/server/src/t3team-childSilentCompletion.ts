/**
 * Silent-completion notice (GHE #55 follow-up, item 5/6): when a child goes
 * terminal-completed WITHOUT having reported to its parent, the parent is
 * told — a finished child is never silent, the same invariant the abnormal-
 * stop notice (GHE #157) gives for dead children.
 *
 * This module holds the PURE decisions and the notice text. The dispatch
 * itself reuses the standalone notifier path (t3team-childAbnormalStopNotify.ts)
 * — there is no second notifier.
 *
 * "Did the child report?" is DERIVED from durable state, not a flag the child
 * sets (a stuck child is exactly the one that would not set it): a child's
 * result reaches the parent as a `thread.actor.message` recorded on the
 * PARENT thread with `role: "actor"` and `t3teamExt.actor.senderThreadId`
 * equal to the child. Any such message — the child's own final result, a
 * question, or a progress note — means the parent already knows this child is
 * alive and doing something, so the notice adds nothing but noise.
 *
 * This check is the "was it silent?" decision, NOT the dedup. Once-per-terminal-
 * epoch dedup (a redelivered/replayed completed event must not fire a second
 * notice) is owned by the shared terminal-notify ledger that the caller wraps
 * the notifier in (t3team-childAbnormalStopDedup.ts /
 * t3team-terminalNotifyDedup.ts) — one durable marker, shared with the
 * abnormal-stop notice.
 *
 * The notice carries ONE short "decide" line (never per-message standing
 * text): the child has finished, so either its work is done and it should be
 * settled (naming the `sweep` op of `t3team_children`), or it needs follow-up.
 * A plan-mode child that stopped awaiting approval is called out explicitly —
 * a parent that knows a plan is waiting acts faster than one told a child
 * merely finished.
 *
 * @module childSilentCompletion
 */
import {
  deriveThreadAwaitingParent,
  threadHasActionableProposedPlan,
} from "@t3tools/shared/t3team-threadAwaitingParent";

/** The message fields the "did it report?" check reads (structural, so the
 *  caller can pass a projection row or a full detail). `| undefined` on each
 *  optional level: the real `OrchestrationMessage.t3teamExt` (and its `actor`
 *  / `senderThreadId`) are optional-and-undefined, and the repo compiles with
 *  `exactOptionalPropertyTypes`, so the target must admit explicit `undefined`.
 */
export interface SilentCompletionMessageLike {
  readonly role: string;
  readonly t3teamExt?:
    | {
        readonly actor?: { readonly senderThreadId?: string | null | undefined } | null | undefined;
      }
    | null
    | undefined;
}

/** A thread-detail-like shape carrying the messages the check scans. */
export interface SilentCompletionThreadMessagesLike {
  readonly messages: ReadonlyArray<SilentCompletionMessageLike>;
}

/** A thread-detail-like shape carrying the plan facts for the approval check. */
export interface SilentCompletionPlanLike {
  readonly interactionMode?: string | null;
  readonly latestTurn: { readonly state: string; readonly turnId?: string | null } | null;
  readonly proposedPlans?: ReadonlyArray<{
    readonly id: string;
    readonly turnId: string | null;
    readonly implementedAt: string | null;
    readonly updatedAt: string;
  }> | null;
}

/**
 * True when the PARENT's durable transcript already holds at least one
 * actor-role message whose sender is this child: the child has reached the
 * parent (its own result, a question, or a notice we already sent). Derived
 * from the parent's state — no flag the child sets.
 */
export function parentReceivedFromChild(
  parent: SilentCompletionThreadMessagesLike,
  childThreadId: string,
): boolean {
  return parent.messages.some(
    (message) =>
      message.role === "actor" && message.t3teamExt?.actor?.senderThreadId === childThreadId,
  );
}

/**
 * True when a plan-mode child settled its latest turn cleanly and still
 * carries an actionable (unimplemented) proposed plan — it stopped after
 * presenting its plan and is awaiting the parent's approval. The SAME
 * predicate the children tool / panel use, so the notice and the state never
 * disagree.
 */
export function childAwaitingParentApproval(child: SilentCompletionPlanLike): boolean {
  return deriveThreadAwaitingParent({
    interactionMode: child.interactionMode,
    latestTurn: child.latestTurn,
    hasActionableProposedPlan: threadHasActionableProposedPlan(
      child.latestTurn,
      child.proposedPlans ?? undefined,
    ),
  });
}

/**
 * The one-line "decide" notice. `awaitingParentApproval` selects the
 * plan-mode wording (explicit about the pending approval) vs the generic
 * "finished, settle or follow up" wording.
 */
export function buildSilentCompletionNotice(input: {
  readonly childTitle: string;
  readonly childThreadId: string;
  readonly awaitingParentApproval: boolean;
}): string {
  const id = input.childThreadId;
  const title = input.childTitle;
  if (input.awaitingParentApproval) {
    return (
      `[Child awaiting your approval] Child «${title}» (thread ${id}) is in plan mode and ` +
      `stopped after presenting its plan — it has NOT implemented yet and is waiting on your ` +
      `approval. Approve the plan (or send direction) so it can proceed; do not settle it ` +
      `until its work is actually done.`
    );
  }
  return (
    `[Child completed silently] Child «${title}» (thread ${id}) finished a turn without ` +
    `reporting back to you. Decide: if its work is done, settle it (t3team_children op:"sweep"); ` +
    `if it needs follow-up, send it a message.`
  );
}
