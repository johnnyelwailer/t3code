/**
 * Shared helpers for the `t3team.thread.children` op modules (GHE #55):
 * argument coercion, target loading, and the read-only status derivation that
 * both `list` and `status` build on. The per-op usage strings (the
 * self-healing discovery surface) live in `t3team-toolBrokerChildrenUsage`
 * and are re-exported here as `opUsage`.
 *
 * @module t3team-toolBrokerChildrenShared
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { threadHasActionableProposedPlan } from "@t3tools/shared/t3team-threadAwaitingParent";
import { deriveThreadRunStatus } from "@t3tools/shared/t3team-threadRunStatus";
import { hasOpenChildWaits } from "@t3tools/shared/t3team-childWaitFacts";

import {
  T3TEAM_CHILDREN_TOOL_ID,
  type ChildThreadDetail,
  type ChildThreadMessage,
  type ChildThreadShell,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { opUsage } from "./t3team-toolBrokerChildrenUsage.ts";

export { opUsage } from "./t3team-toolBrokerChildrenUsage.ts";

/** Truncation length for a last-message summary. */
const LAST_MESSAGE_SUMMARY_CHARS = 240;

// ── Small helpers ───────────────────────────────────────────────────────────

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function summarizeLastMessage(
  messages: ReadonlyArray<ChildThreadMessage>,
): { readonly role: string; readonly text: string; readonly createdAt: string | null } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const text = (message.text ?? "").trim();
    if (text.length === 0) continue;
    const truncated =
      text.length > LAST_MESSAGE_SUMMARY_CHARS
        ? text.slice(0, LAST_MESSAGE_SUMMARY_CHARS) + "…"
        : text;
    return { role: message.role, text: truncated, createdAt: message.createdAt ?? null };
  }
  return null;
}

export function elapsedMs(startIso: string | null, endIso: string): number | null {
  if (!startIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return end - start;
}

export function formatElapsed(ms: number): string {
  if (ms < 1_000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function childStatusFromDetail(
  detail: ChildThreadDetail,
  hasLiveChildren: boolean = false,
): Record<string, unknown> {
  const status = deriveThreadRunStatus({
    ...detail,
    hasLiveChildren,
    // Detail loads carry the proposed-plan records, not the shell's derived
    // flag — fold them into the same fact so list and status never disagree.
    hasActionableProposedPlan: threadHasActionableProposedPlan(
      detail.latestTurn,
      detail.proposedPlans,
    ),
    // The DECLARED waiting fact: open registered child waits on this thread
    // (activities exist only on the detail load, not on shell snapshots).
    hasOpenChildWaits: hasOpenChildWaits(detail.activities),
  });
  const lastMessage = summarizeLastMessage(detail.messages);
  return {
    threadId: status.threadId,
    title: status.title,
    state: status.state,
    provider: status.provider,
    model: status.model,
    createdAt: status.createdAt,
    lastActivityAt: status.lastActivityAt,
    ...(detail.settledOverride === "settled"
      ? { settled: true as const, settledAt: detail.settledAt ?? undefined }
      : {}),
    ...(status.branch ? { branch: status.branch } : {}),
    ...(status.worktreePath ? { worktreePath: status.worktreePath } : {}),
    ...(status.childStatus ? { childStatus: status.childStatus } : {}),
    // Detail loads carry no shell pending flag; derive the same fact from the
    // thread's user-input activity lifecycle (retention keeps the pending row).
    ...(detailHasOpenUserInputRequest(detail.activities) ? { awaitingUserInput: true } : {}),
    ...(status.awaitingParent ? { awaitingParent: true } : {}),
    // DECLARED waiting: this thread registered a child wait (`op: wait`) that
    // is still pending — the open registered/resolved activity set.
    ...(status.waitingDeclared ? { waitingDeclared: true } : {}),
    ...(lastMessage ? { lastMessage: lastMessage } : {}),
  };
}

export function childStatusFromShell(
  shell: ChildThreadShell,
  hasLiveChildren: boolean = false,
): Record<string, unknown> {
  const status = deriveThreadRunStatus({ ...shell, hasLiveChildren });
  return {
    threadId: status.threadId,
    title: status.title,
    state: status.state,
    provider: status.provider,
    model: status.model,
    createdAt: status.createdAt,
    lastActivityAt: status.lastActivityAt,
    ...(shell.settledOverride === "settled"
      ? { settled: true as const, settledAt: shell.settledAt ?? undefined }
      : {}),
    ...(status.branch ? { branch: status.branch } : {}),
    ...(status.worktreePath ? { worktreePath: status.worktreePath } : {}),
    ...(status.childStatus ? { childStatus: status.childStatus } : {}),
    // Shell live state: a question docked in this child's composer.
    ...(status.awaitingUserInput ? { awaitingUserInput: true } : {}),
    // Shell live state: a plan-mode child that presented its plan and stopped.
    ...(status.awaitingParent ? { awaitingParent: true } : {}),
    // NOTE: the DECLARED waiting fact (`waitingDeclared`) is NOT surfaced on
    // shell rows — it is derived from the thread's durable child-wait
    // activities, which only the DETAIL load carries. The `status` op
    // (childStatusFromDetail) is where it appears; `list` rows stay lean.
  };
}

/**
 * True when the detail load carries an open user-input.requested — a question
 * docked in that thread's composer. Activities arrive in sequence order;
 * requested opens a requestId, resolved closes it. (The shell's
 * hasPendingUserInput flag is the same fact for live shells; detail loads do
 * not carry it, so the status op derives it here.)
 */
export function detailHasOpenUserInputRequest(
  activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>,
): boolean {
  const openRequestIds = new Set<string>();
  for (const activity of activities) {
    const payload =
      typeof activity.payload === "object" && activity.payload !== null
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId =
      payload !== null && typeof payload.requestId === "string" ? payload.requestId : null;
    if (requestId === null) continue;
    if (activity.kind === "user-input.requested") {
      openRequestIds.add(requestId);
    } else if (activity.kind === "user-input.resolved") {
      openRequestIds.delete(requestId);
    }
  }
  return openRequestIds.size > 0;
}

/** The direct children of a thread, from its `t3team.handoff.started` activities. */
export function directChildren(
  detail: ChildThreadDetail,
): ReadonlyArray<{ readonly threadId: string; readonly title: string | null }> {
  const seen = new Set<string>();
  const children: Array<{ threadId: string; title: string | null }> = [];
  for (const activity of detail.activities) {
    if (activity.kind !== "t3team.handoff.started") continue;
    const payload = activity.payload as
      | { readonly childThreadId?: unknown; readonly childTitle?: unknown }
      | null
      | undefined;
    const childThreadId =
      payload && typeof payload.childThreadId === "string" ? payload.childThreadId : undefined;
    if (!childThreadId || seen.has(childThreadId)) continue;
    seen.add(childThreadId);
    const childTitle =
      payload && typeof payload.childTitle === "string" ? payload.childTitle : null;
    children.push({ threadId: childThreadId, title: childTitle });
  }
  return children;
}

function assertSameProject(
  deps: T3TeamChildrenToolDeps,
  target: ChildThreadDetail | ChildThreadShell,
): string | undefined {
  if ("projectId" in target && target.projectId !== undefined) {
    return target.projectId !== deps.callerProjectId
      ? `Thread ${target.id} is in a different project; ${T3TEAM_CHILDREN_TOOL_ID} only reaches threads in the caller's project.`
      : undefined;
  }
  return undefined;
}

/** Load a target thread by id, failing with a human-readable message when it is
 *  missing or in another project. Shared by status/wait/stop/close. */
export function loadTarget(
  deps: T3TeamChildrenToolDeps,
  threadId: string,
): Effect.Effect<ChildThreadDetail, string> {
  return deps.loadThreadDetail(ThreadId.make(threadId)).pipe(
    Effect.flatMap((detail) => {
      if (!detail) return Effect.fail(`Thread ${threadId} was not found.`);
      const crossProject = assertSameProject(deps, detail);
      if (crossProject) return Effect.fail(crossProject);
      return Effect.succeed(detail);
    }),
  );
}
