/**
 * GHE #415: one agent turn launched 87 runs in a loop because nothing enforced "a successful
 * handoff ends the turn". A second launch from the same thread while a run it launched is still
 * ACTIVE is refused with the way out spelled out: observe it, or pass `replaceRunId` to stop it and
 * launch the replacement in one call.
 *
 * Keyed on the run's live state, never on a time window (review of fork #349: authoring can take
 * longer than any window, after which a copy slipped through and `replaceRunId` was ignored).
 * Active = the run is being authored, waiting for capacity, executing, or parked on an agent/user
 * ask. A run parked on the clock or an event (`sleeping`/`watching`) or deliberately `paused` is
 * not consuming the thread's attention, so it does not block a new launch — a daily routine must
 * not lock its thread out of orchestration for the rest of its life. `replaceRunId` still targets
 * any non-terminal run of this thread.
 */

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "authoring",
  "queued",
  "running",
  "suspended",
]);
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);

export function recentActiveLaunchBlocker(
  rows: ReadonlyArray<{
    readonly runId: string;
    readonly launchThreadId: string | null;
    readonly status: string;
    readonly createdAt: string;
  }>,
  input: {
    readonly threadId: string;
    /** Kept for the message only (how long ago); never decides. */
    readonly nowMs: number;
    readonly replaceRunId?: string | undefined;
  },
):
  | { readonly kind: "ok" }
  | { readonly kind: "replace"; readonly runId: string }
  | { readonly kind: "refuse"; readonly message: string } {
  const own = rows.filter((row) => row.launchThreadId === input.threadId);
  if (
    input.replaceRunId !== undefined &&
    own.some((row) => row.runId === input.replaceRunId && !TERMINAL_RUN_STATUSES.has(row.status))
  ) {
    return { kind: "replace", runId: input.replaceRunId };
  }
  const active = own.filter((row) => ACTIVE_STATUSES.has(row.status));
  if (active.length === 0) return { kind: "ok" };
  const newest = active[0]!;
  const ageSeconds = Math.max(0, Math.round((input.nowMs - Date.parse(newest.createdAt)) / 1000));
  return {
    kind: "refuse",
    message:
      `This thread launched orchestration run '${newest.runId}' ${ageSeconds}s ago and it is still ` +
      `${newest.status}. A successful launch ends your turn — do not launch another copy. ` +
      `Observe it with t3team_orchestration_status('${newest.runId}'); to replace it, call ` +
      `t3team_orchestration_run again with replaceRunId: '${newest.runId}' (the old run is stopped first); ` +
      `to change its inputs or source, use t3team_orchestration_resume('${newest.runId}', …).`,
  };
}
