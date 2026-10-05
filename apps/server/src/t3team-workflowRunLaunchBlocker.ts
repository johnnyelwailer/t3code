/**
 * GHE #415: one agent turn launched 87 runs in a loop because nothing enforced "a successful
 * handoff ends the turn". A second launch from the same thread while a run it launched moments ago
 * is still active is refused with the way out spelled out: observe it, or pass `replaceRunId` to
 * stop it and launch the replacement in one call. An authoring run counts as active.
 */

/** How recently a launch from the same thread blocks another one without `replaceRunId`. */
const RECENT_LAUNCH_WINDOW_MS = 2 * 60_000;
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function recentActiveLaunchBlocker(
  rows: ReadonlyArray<{
    readonly runId: string;
    readonly launchThreadId: string | null;
    readonly status: string;
    readonly createdAt: string;
  }>,
  input: {
    readonly threadId: string;
    readonly nowMs: number;
    readonly replaceRunId?: string | undefined;
  },
):
  | { readonly kind: "ok" }
  | { readonly kind: "replace"; readonly runId: string }
  | { readonly kind: "refuse"; readonly message: string } {
  const recent = rows.filter(
    (row) =>
      row.launchThreadId === input.threadId &&
      !TERMINAL_RUN_STATUSES.has(row.status) &&
      input.nowMs - Date.parse(row.createdAt) < RECENT_LAUNCH_WINDOW_MS,
  );
  if (recent.length === 0) return { kind: "ok" };
  if (input.replaceRunId !== undefined && recent.some((row) => row.runId === input.replaceRunId)) {
    return { kind: "replace", runId: input.replaceRunId };
  }
  const newest = recent[0]!;
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
