/**
 * Unconditional abnormal-stop notification to a child's parent (GHE #157).
 *
 * A child that stops abnormally (session `error`/`interrupted`/`stopped`) must
 * tell its parent even when the parent never registered a `t3team_children`
 * wait. The wait-resolution path (t3team-childWaitResolve.ts) only fires for a
 * registered wait; with none, a dead child was silent. This module owns the
 * standalone notification: it finds the child's parent from the start-child
 * handoff activity and dispatches a `thread.actor.message` to the parent — the
 * same channel the wait-resolution and `send_message` paths use, which drives
 * the parent's agent to react.
 *
 * Dedup: the caller (the child-wait reactor) invokes this ONLY when no matching
 * wait resolved for the same child+outcome, so the parent never receives both a
 * wait-resolution message and a standalone one for a single stop.
 *
 * @module t3team-childAbnormalStopNotify
 */
import { CommandId, MessageId, NonNegativeInt, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

/** The abnormal terminal outcomes that warrant a parent notification. */
export type AbnormalStopOutcome = "failed" | "aborted";

export interface HandoffActivityLike {
  readonly kind: string;
  readonly payload: unknown;
}

/**
 * Find the parent thread id a child was started from, from its
 * `t3team.handoff.created` activity (the start-child handoff persists
 * `parentThreadId` in the payload). Newest handoff wins. Returns null when the
 * thread is not a start-child, the parent is absent, or the child is owned by a
 * workflow run (its handoff payload carries a `workflowRunId` — the workflow
 * engine, not the launching thread, owns that child's lifecycle).
 */
export function findHandoffParentThreadId(
  activities: ReadonlyArray<HandoffActivityLike>,
): string | null {
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i]!;
    if (activity.kind !== "t3team.handoff.created") continue;
    const payload = activity.payload as
      | { readonly parentThreadId?: unknown; readonly workflowRunId?: unknown }
      | null
      | undefined;
    if (!payload) continue;
    if (typeof payload.workflowRunId === "string") continue;
    if (typeof payload.parentThreadId === "string" && payload.parentThreadId.length > 0) {
      return payload.parentThreadId;
    }
  }
  return null;
}

/**
 * Build the abnormal-stop detail fragment shared by the standalone notification
 * and the folded-in wait-resolution message. `null` when there is nothing to add.
 */
export function buildAbnormalStopDetail(input: {
  readonly lastError: string | null | undefined;
  readonly childStatus: string | null | undefined;
}): string | null {
  const reason = input.lastError?.trim();
  const state = input.childStatus?.trim();
  if (!reason && !state) return null;
  const parts: string[] = [];
  if (reason) parts.push(`Reason: ${reason}`);
  if (state) parts.push(`Last known state: ${state}`);
  return parts.join("; ");
}

export interface ChildAbnormalStopNotifierDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
}

export interface NotifyChildAbnormalStopInput {
  readonly childThreadId: string;
  readonly outcome: AbnormalStopOutcome;
  readonly lastError: string | null | undefined;
}

export type NotifyChildAbnormalStop = (input: NotifyChildAbnormalStopInput) => Effect.Effect<void>;

/**
 * Build the standalone abnormal-stop notifier. Loads the child's detail once
 * (parent id + last-known state), then dispatches a single `thread.actor.message`
 * to the parent. Never throws into the caller's event stream: dispatch failures
 * are logged, not raised.
 */
export const makeChildAbnormalStopNotifier =
  (deps: ChildAbnormalStopNotifierDeps): NotifyChildAbnormalStop =>
  (input) =>
    Effect.gen(function* () {
      const child = Option.getOrUndefined(
        yield* deps.query
          .getThreadDetailById(ThreadId.make(input.childThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      );
      if (!child) return;
      const parentThreadId = findHandoffParentThreadId(child.activities);
      if (!parentThreadId) return;
      const detail = buildAbnormalStopDetail({
        lastError: input.lastError,
        childStatus: child.childStatus,
      });
      const outcomeLabel = input.outcome === "failed" ? "failed" : "was aborted";
      const text =
        `[Child stopped abnormally] Child «${child.title}» (thread ${child.id}) ` +
        `stopped abnormally (${outcomeLabel}). It did not complete.` +
        (detail ? ` ${detail}.` : "");
      const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
      yield* deps.engine
        .dispatch({
          type: "thread.actor.message",
          commandId: CommandId.make(`server:t3team:child-abnormal-stop:${t3teamRandomUUID()}`),
          threadId: ThreadId.make(parentThreadId),
          messageId: MessageId.make(t3teamRandomUUID()),
          fromThreadId: ThreadId.make(child.id),
          fromTitle: child.title,
          fromProjectId: child.projectId,
          text,
          urgency: "normal",
          hopCount: NonNegativeInt.make(0),
          rootThreadId: ThreadId.make(parentThreadId),
          createdAt: nowIso,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("child abnormal-stop actor message failed", {
              childThreadId: input.childThreadId,
              parentThreadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
    });
