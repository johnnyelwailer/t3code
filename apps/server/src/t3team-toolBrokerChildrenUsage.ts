/**
 * Per-op usage strings for the `t3team.thread.children` meta tool — the
 * self-healing discovery surface (`help`, and the message of a malformed call).
 *
 * @module t3team-toolBrokerChildrenUsage
 */
import {
  T3TEAM_CHILD_OPS,
  T3TEAM_CHILD_REMOVED_OPS,
  type T3TeamChildOp,
} from "./t3team-toolBrokerChildrenTypes.ts";

const T3TEAM_CHILDREN_OP_USAGE: Record<T3TeamChildOp, string> = {
  watch: `children({ op: "watch", thread_id, timeout?: number }) — watch a thread for silence: this thread is notified when the target has had no activity for timeout ms (default 15 minutes; per-subscription), re-notified at each multiple of the timeout while it stays silent. The notification flags whether a tool call was still in progress (legitimate long operation vs. the real stuck signal). If the target stops, the watch closes with a stopped note.`,
  unwatch: `children({ op: "unwatch", thread_id }) — cancel this thread's silence watches on the target thread.`,
  sweep: `children({ op: "sweep", thread_ids?: string[], all_older_than_hours?: number }) — settle finished (completed/failed/aborted) threads in bulk: given thread ids and/or all of this thread's finished children older than N hours. Running threads are skipped, never force-settled. Cleanup protocol: verify each first (final result / discarded work / unpushed work in worktrees), then sweep; settled threads keep their transcripts and drop out of the active rosters.`,
  drain: `children({ op: "drain" }) — claim THIS thread's own pending inter-agent mailbox now instead of waiting for the boundary drain. Takes no arguments. Returns dispatched (idle: the digest turn just started), queued (mid-turn: arrives when the turn ends), or held (suppressed: stays in the timeline until the user re-engages).`,
  environments: `children({ op: "environments" }) — read-only: the environments delegate_task's extensions.environment can target — this server's own environment (isDefault:true) plus the cross-environment bindings already recorded on threads here (label, bound-thread count). Messaging and completion wakes stay in this environment, so report-back from a cross-environment child needs a separate channel.`,
  help: `children({ op: "help", op_name?: string }) — the exact usage for one op; omit op_name for all ops.`,
};

export function opUsage(op: T3TeamChildOp | string): string {
  const usage = T3TEAM_CHILDREN_OP_USAGE[op as T3TeamChildOp];
  if (usage !== undefined) return usage;
  const moved = T3TEAM_CHILD_REMOVED_OPS[op];
  return moved !== undefined
    ? `op '${op}' was removed from t3team_children: ${moved}.`
    : `Unknown op '${op}'. Valid ops: ${T3TEAM_CHILD_OPS.join(", ")}.`;
}
