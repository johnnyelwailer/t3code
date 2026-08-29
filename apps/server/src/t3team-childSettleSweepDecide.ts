// @effect-diagnostics globalDate:off -- the TTL read (Date.parse on persisted
// ISO stamps) compares against a caller-supplied wall-clock millisecond now,
// which keeps the decision pure and clock-free; the sweeper owns the clock.
/**
 * Pure child-settle sweep decision (GHE #304 part A): TTL constants, the
 * terminal-state precedence, and candidate selection for the
 * `thread.settle` dispatch pass in `t3team-childSettleSweeper`.
 *
 * Terminal child threads (completed/failed/aborted) that have sat past the
 * settle TTL become "settled": they keep their full transcripts and drop out
 * of the active rosters. This module only decides; the Effect dispatch and
 * the host interval live in the sweeper module.
 *
 * @module t3team-childSettleSweepDecide
 */

/** Default child-settle TTL: a terminal child settles 48h after it went terminal. */
export const CHILD_SETTLE_TTL_MS = 48 * 60 * 60 * 1_000;
/** Default sweep cadence: 5 minutes (the brief's 5–10 min band, lower end —
 *  the sweep is a cheap projection scan and settles nothing within 48h). */
export const CHILD_SETTLE_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;

function envMs(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs;
}

export function childSettleTtlMs(): number {
  return envMs("T3TEAM_CHILD_SETTLE_TTL_MS", CHILD_SETTLE_TTL_MS);
}

export function childSettleSweepIntervalMs(): number {
  return envMs("T3TEAM_CHILD_SETTLE_SWEEP_INTERVAL_MS", CHILD_SETTLE_SWEEP_INTERVAL_MS);
}

export interface SettleSweepCandidate {
  readonly threadId: string;
  readonly state: "completed" | "failed" | "aborted";
  /** Milliseconds the thread has sat terminal. */
  readonly ageMs: number;
}

export interface SettleSweepShellLike {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly settledOverride: string | null;
  readonly session: { readonly status: string } | null;
  readonly latestTurn: { readonly state: string } | null;
  /** Optional in the persistence schema: absent = no live background work. */
  readonly backgroundLiveness?: "working" | "monitoring" | null | undefined;
}

const TERMINAL_STATES = new Set(["completed", "failed", "aborted"]);

/**
 * Pure candidate selection: terminal, not running, not already settled, not
 * archived, child, and past the TTL. The state rules mirror
 * `deriveThreadRunState` (packages/shared) — the shared module cannot be
 * imported here without the full ThreadRunStatus derivation the sweep does
 * not need, so the terminal precedence is kept local and total.
 */
export function pickSettleSweepCandidates(
  shells: ReadonlyArray<SettleSweepShellLike>,
  childThreadIds: ReadonlySet<string>,
  options: { readonly nowMs: number; readonly ttlMs: number },
): ReadonlyArray<SettleSweepCandidate> {
  const candidates: SettleSweepCandidate[] = [];
  for (const shell of shells) {
    if (shell.archivedAt !== null || shell.settledOverride === "settled") continue;
    if (!childThreadIds.has(shell.id)) continue;
    const state = stateOfShell(shell);
    if (!TERMINAL_STATES.has(state)) continue;
    const terminalAtMs = Date.parse(shell.updatedAt);
    if (Number.isNaN(terminalAtMs)) continue;
    const ageMs = options.nowMs - terminalAtMs;
    if (ageMs < options.ttlMs) continue;
    candidates.push({
      threadId: shell.id,
      state: state as SettleSweepCandidate["state"],
      ageMs,
    });
  }
  return candidates;
}

/** Same terminal precedence as `deriveThreadRunState`: session status
 *  outranks turn state; a live background fleet outranks a settled turn. */
export function stateOfShell(
  shell: Pick<SettleSweepShellLike, "session" | "latestTurn" | "backgroundLiveness">,
): "running" | "idle" | "completed" | "failed" | "aborted" {
  const sessionStatus = shell.session?.status;
  const turnState = shell.latestTurn?.state;
  if (sessionStatus === "running" || sessionStatus === "starting") return "running";
  if (sessionStatus === "error") return "failed";
  if (sessionStatus === "interrupted" || sessionStatus === "stopped") return "aborted";
  if (turnState === "running") return "running";
  if (turnState === "error") return "failed";
  if (turnState === "interrupted") return "aborted";
  if (shell.backgroundLiveness === "working") return "running";
  if (turnState === "completed") return "completed";
  return "idle";
}
