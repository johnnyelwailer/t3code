import { type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { appendThreadActivity } from "./t3work-toolBrokerStartChildActivity.ts";

/**
 * Frame a child session's kickoff input with its parent's identity so the child
 * agent immediately knows who delegated it and where to report back. The *how*
 * (use t3work_send_message, don't wait to be polled) belongs in the agent's
 * system prompt; only the parent's per-instance identity is attached here. This
 * applies to every provider — for input-only drivers (e.g. Pi) this framing is
 * the sole channel through which the child ever learns its parent thread id.
 */
export function buildChildKickoffText(
  parentThread: { readonly id: ThreadId; readonly title: string },
  kickoffPrompt: string,
): string {
  return (
    `[Delegated by parent thread «${parentThread.title}» (thread ${parentThread.id}). ` +
    `Report progress and results back to it with t3work_send_message.]\n\n${kickoffPrompt}`
  );
}

export function resolveStartChildHandoffPlacement(input: {
  readonly currentDisplayMode: "embedded" | "thread" | undefined;
  readonly currentTicketId: string | undefined;
  readonly requestedTicketId: string | undefined;
  readonly threadId: ThreadId;
}): { readonly parentThreadId?: ThreadId; readonly ticketId?: string } {
  const ticketId = input.requestedTicketId ?? input.currentTicketId;
  return {
    parentThreadId: input.threadId,
    ...(ticketId ? { ticketId } : {}),
  };
}

export function appendStartChildHandoffActivities(input: {
  readonly orchestration: OrchestrationEngineShape;
  readonly threadId: ThreadId;
  readonly threadTitle: string;
  readonly childThreadId: ThreadId;
  readonly childTitle: string;
  readonly createdAt: string;
  readonly handoffParentThreadId?: ThreadId;
  readonly ticketId?: string;
  readonly repoFullName?: string | null;
  readonly repoRef?: string | null;
  readonly branch?: string | null;
  readonly worktreePath?: string | null;
  readonly kickoffPrompt?: string;
}) {
  const payload = {
    ...(input.handoffParentThreadId ? { parentThreadId: input.handoffParentThreadId } : {}),
    parentTitle: input.threadTitle,
    childThreadId: input.childThreadId,
    childTitle: input.childTitle,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    ...(input.repoFullName ? { repoFullName: input.repoFullName } : {}),
    ...(input.repoRef ? { repoRef: input.repoRef } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
    ...(input.kickoffPrompt ? { kickoffPrompt: input.kickoffPrompt } : {}),
  };

  return Effect.all([
    appendThreadActivity(input.orchestration, input.threadId, {
      kind: "t3work.handoff.started",
      summary: `Started child session ${input.childTitle}`,
      payload,
      createdAt: input.createdAt,
    }),
    appendThreadActivity(input.orchestration, input.childThreadId, {
      kind: "t3work.handoff.created",
      summary: `Created from ${input.threadTitle}`,
      payload,
      createdAt: input.createdAt,
    }),
  ]).pipe(
    Effect.asVoid,
    Effect.catch(() => Effect.void),
  );
}
