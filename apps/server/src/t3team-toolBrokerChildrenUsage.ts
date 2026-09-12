/**
 * Per-op usage strings for the `t3team.thread.children` meta tool (GHE #55) —
 * the self-healing discovery surface. Kept in its own module so the shared
 * helpers stay under the additive guard's 200-line cap for t3team-prefixed
 * files; `t3team-toolBrokerChildrenShared` re-exports `opUsage`.
 *
 * @module t3team-toolBrokerChildrenUsage
 */
import { T3TEAM_CHILD_OPS, type T3TeamChildOp } from "./t3team-toolBrokerChildrenTypes.ts";

export const T3TEAM_CHILDREN_OP_USAGE: Record<T3TeamChildOp, string> = {
  list: `children({ op: "list", all?: boolean, include_settled?: boolean }) — this thread's child sessions with live state (name, state, provider+model, created/last-activity, worktree+branch when isolated, last-message summary; awaitingUserInput when a question is docked in the child's composer; awaitingParent when a plan-mode child presented its plan and stopped, waiting on your approval — the turn IS completed, the plan is not yet implemented). A thread whose own work is settled but which still has live (non-terminal, non-settled) children reads state "waiting" instead of "completed"/"idle". all:true lists the whole project instead. Settled children are EXCLUDED by default; include_settled:true lists them with a settled:true marker.`,
  status: `children({ op: "status", thread_id }) — one thread's current turn state, in-progress work, elapsed time, awaitingUserInput when a question is docked in its composer, awaitingParent when a plan-mode thread's plan is still unimplemented, waitingDeclared when a child wait this thread registered (op: wait) is still pending (the DECLARED blocking state; the DERIVED live-children fact is state "waiting"), and a recent activity tail.`,
  wait: `children({ op: "wait", thread_id, on?: "terminal"|"completed"|"failed", timeout?: number }) — durably resume this turn when the target thread reaches a terminal state (default on:"terminal"); a dead child resolves as failed. timeout is milliseconds.`,
  watch: `children({ op: "watch", thread_id, timeout?: number }) — watch a thread for silence (GHE #63): this thread is notified when the target has had no activity for timeout ms (default 900000 = 15m; per-subscription), re-notified at each multiple of the timeout while it stays silent. The notification flags whether a tool call was still in progress (legitimate long operation vs. the real stuck signal). If the target stops (terminal state) the watch closes with a stopped note.`,
  unwatch: `children({ op: "unwatch", thread_id }) — cancel all silence watches this thread has on the target thread.`,
  stop: `children({ op: "stop", thread_id, reason?: string }) — halt the target thread's running turn (sticky: queued agent messages will not re-open it; a real user message re-engages it).`,
  close: `children({ op: "close", thread_id }) — mark the target child done from this side (bookkeeping once its final report has arrived).`,
  sweep: `children({ op: "sweep", thread_ids?: string[], all_older_than_hours?: number }) — settle terminal (completed/failed/aborted) threads in bulk: given thread ids and/or all of this thread's terminal children older than N hours. Non-terminal threads are skipped, never force-settled. Cleanup protocol: verify each state first (final result / discarded work / unpushed work in worktrees) — e.g. in a dedicated cleanup child — then sweep; settled threads keep their transcripts and drop out of the active rosters.`,
  drain: `children({ op: "drain" }) — claim THIS thread's own pending inter-agent mailbox now, instead of waiting for the boundary drain. Takes no arguments. Returns one of: dispatched (the thread was idle — the digest turn just started), queued (the thread is mid-turn — the messages stay queued and arrive when the turn ends), or held (auto-dispatch is suppressed — the messages stay visible in the timeline until the user re-engages). Use it when you want the agent's own inbound agent messages delivered immediately rather than on the coalescing window.`,
  help: `children({ op: "help", op_name?: string }) — the exact schema/usage for one op; omit op_name for all ops.`,
};

export function opUsage(op: T3TeamChildOp | string): string {
  return (
    T3TEAM_CHILDREN_OP_USAGE[op as T3TeamChildOp] ??
    `Unknown op '${op}'. Valid ops: ${T3TEAM_CHILD_OPS.join(", ")}.`
  );
}
