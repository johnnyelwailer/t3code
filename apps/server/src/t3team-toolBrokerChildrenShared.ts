/**
 * Shared helpers for the `t3team.thread.children` op modules (GHE #55): the
 * per-op usage strings (the self-healing discovery surface), argument
 * coercion, target loading, and the read-only status derivation that both
 * `list` and `status` build on.
 *
 * @module t3team-toolBrokerChildrenShared
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { deriveThreadRunStatus } from "@t3tools/shared/t3team-threadRunStatus";

import {
  T3TEAM_CHILD_OPS,
  T3TEAM_CHILDREN_TOOL_ID,
  type ChildThreadDetail,
  type ChildThreadMessage,
  type ChildThreadShell,
  type T3TeamChildOp,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";

/** Truncation length for a last-message summary. */
const LAST_MESSAGE_SUMMARY_CHARS = 240;

// ── Per-op usage (the self-healing discovery surface) ──────────────────────

const OP_USAGE: Record<T3TeamChildOp, string> = {
  list: `children({ op: "list", all?: boolean, include_settled?: boolean }) — this thread's child sessions with live state (name, state, provider+model, created/last-activity, worktree+branch when isolated, last-message summary). all:true lists the whole project instead. Settled children are EXCLUDED by default; include_settled:true lists them with a settled:true marker.`,
  status: `children({ op: "status", thread_id }) — one thread's current turn state, in-progress work, elapsed time, and a recent activity tail.`,
  wait: `children({ op: "wait", thread_id, on?: "terminal"|"completed"|"failed", timeout?: number }) — durably resume this turn when the target thread reaches a terminal state (default on:"terminal"); a dead child resolves as failed. timeout is milliseconds.`,
  watch: `children({ op: "watch", thread_id, timeout?: number }) — watch a thread for silence (GHE #63): this thread is notified when the target has had no activity for timeout ms (default 900000 = 15m; per-subscription), re-notified at each multiple of the timeout while it stays silent. The notification flags whether a tool call was still in progress (legitimate long operation vs. the real stuck signal). If the target stops (terminal state) the watch closes with a stopped note.`,
  unwatch: `children({ op: "unwatch", thread_id }) — cancel all silence watches this thread has on the target thread.`,
  stop: `children({ op: "stop", thread_id, reason?: string }) — halt the target thread's running turn.`,
  close: `children({ op: "close", thread_id }) — mark the target child done from this side (bookkeeping once its final report has arrived).`,
  sweep: `children({ op: "sweep", thread_ids?: string[], all_older_than_hours?: number }) — settle terminal (completed/failed/aborted) threads in bulk: given thread ids and/or all of this thread's terminal children older than N hours. Non-terminal threads are skipped, never force-settled. Cleanup protocol: verify each state first (final result / discarded work / unpushed work in worktrees) — e.g. in a dedicated cleanup child — then sweep; settled threads keep their transcripts and drop out of the active rosters.`,
  help: `children({ op: "help", op_name?: string }) — the exact schema/usage for one op; omit op_name for all ops.`,
};

export function opUsage(op: T3TeamChildOp | string): string {
  return (
    OP_USAGE[op as T3TeamChildOp] ??
    `Unknown op '${op}'. Valid ops: ${T3TEAM_CHILD_OPS.join(", ")}.`
  );
}

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

export function childStatusFromDetail(detail: ChildThreadDetail): Record<string, unknown> {
  const status = deriveThreadRunStatus(detail);
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
    ...(lastMessage ? { lastMessage: lastMessage } : {}),
  };
}

export function childStatusFromShell(shell: ChildThreadShell): Record<string, unknown> {
  const status = deriveThreadRunStatus(shell);
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
  };
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
