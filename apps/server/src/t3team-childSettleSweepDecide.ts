// @effect-diagnostics globalDate:off -- the TTL read (Date.parse on persisted
// ISO stamps) compares against a caller-supplied wall-clock millisecond now,
// which keeps the decision pure and clock-free; the sweeper owns the clock.
/**
 * Pure child-settle sweep decision (GHE #304 part A): TTL constants, the
 * terminal-state precedence, and candidate selection for the
 * `thread.settle` dispatch pass in `t3team-childSettleSweeper`.
 *
 * Two rules nominate a child for settling:
 * 1. Settled-parent rule: a settled parent is the authoritative signal that
 *    its children's work is over, so every unsettled child of a settled
 *    parent settles on the next sweep — regardless of the child's
 *    terminality and the 48h TTL. Live-work protection stays here: a child
 *    with a running session/turn or live background work (subagent fleets,
 *    watch loops) is never nominated under this rule, for the same reason
 *    the TTL rule hard-skips it. The parent's settled state is re-read on
 *    every pass, so a parent that un-settles stops being a settle reason at
 *    once; children keep settling under the TTL rule only, and any child the
 *    user or activity wakes back up recovers through `thread.unsettled`.
 *    A parent that un-settles BETWEEN the sweep's snapshot read and the
 *    decider's decision is caught by the settle command's
 *    `requireSettledParentThreadId` precondition, which the decider re-checks
 *    against its own read model.
 * 2. TTL rule: terminal child threads (completed/failed/aborted) that have
 *    sat past the settle TTL become "settled": they keep their full
 *    transcripts and drop out of the active rosters.
 *
 * Settling here is bookkeeping, never a stop: the dispatch uses a
 * `server:` command id, which `ProviderCommandReactor` skips when tearing
 * down provider sessions. The decider still rejects settling a thread whose
 * session is coming alive or that has open blocking work, and the engine
 * re-checks the LIVE background-liveness registry at decide time for every
 * server-driven settle (they all stamp `requireNoLiveBackgroundLiveness`),
 * so work that starts while a command sits in the queue still blocks the
 * settle; stranded registry entries cannot pin a child forever because the
 * liveness source bounds them (ThreadBackgroundLiveness, #475). After such
 * a rejection the sweep honours a retry block (CHILD_SETTLE_RETRY_BLOCK_MS)
 * so a blocked child is not re-nominated — and not re-receipted — every
 * pass.
 *
 * This module only decides; the Effect dispatch and the host interval live
 * in the sweeper module.
 * @module t3team-childSettleSweepDecide
 */

/** Default child-settle TTL: a terminal child settles 48h after it went terminal. */
export const CHILD_SETTLE_TTL_MS = 48 * 60 * 60 * 1_000;
/** Default sweep cadence: 5 minutes (the brief's 5–10 min band, lower end —
 *  the sweep is a cheap projection scan and settles nothing within 48h). */
export const CHILD_SETTLE_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
/** After a settle is blocked or fails, the sweep does not re-nominate the
 *  same child for this long: one blocked child must not burn a warning log,
 *  a failure metric and a persisted rejected receipt on every 5-minute pass
 *  (receipts key on commandId, so fresh command ids do not dedupe). */
export const CHILD_SETTLE_RETRY_BLOCK_MS = 60 * 60 * 1_000;
/**
 * After a restart the in-memory retry-backoff map is wiped, so the startup
 * pass would otherwise re-fire every previously-blocked child at once. For
 * this window after boot, settle attempts are spread across passes by a
 * stable per-child phase (see CHILD_SETTLE_STARTUP_STAGGER / attempt slot)
 * instead of firing in one burst.
 */
export const CHILD_SETTLE_STARTUP_GRACE_MS = 4 * CHILD_SETTLE_SWEEP_INTERVAL_MS;
/** Spread boot-time settle attempts across this many consecutive passes. */
export const CHILD_SETTLE_STARTUP_STAGGER = 4;

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

export function childSettleRetryBlockMs(): number {
  return envMs("T3TEAM_CHILD_SETTLE_RETRY_BLOCK_MS", CHILD_SETTLE_RETRY_BLOCK_MS);
}

export function childSettleStartupGraceMs(): number {
  return envMs("T3TEAM_CHILD_SETTLE_STARTUP_GRACE_MS", CHILD_SETTLE_STARTUP_GRACE_MS);
}

/**
 * Stable per-child dispatch phase for the startup grace. FNV-1a over the
 * thread id gives each child a fixed slot in [0, STAGGER); a child may
 * dispatch in a pass only when the pass's slot index matches its phase, so
 * boot-time candidates spread across STAGGER consecutive passes instead of
 * firing in one burst. Deterministic in (threadId, pass slot) only — no
 * host clock, so it is pure and restart-stable.
 */
export function childSettleAttemptSlot(threadId: string, passSlot: number): boolean {
  let hash = 0x811c9dc5;
  for (let i = 0; i < threadId.length; i++) {
    hash = Math.imul(hash ^ threadId.charCodeAt(i), 0x01000193);
  }
  const phase = (hash >>> 0) % CHILD_SETTLE_STARTUP_STAGGER;
  const slot =
    ((passSlot % CHILD_SETTLE_STARTUP_STAGGER) + CHILD_SETTLE_STARTUP_STAGGER) %
    CHILD_SETTLE_STARTUP_STAGGER;
  return phase === slot;
}

type ShellState = "running" | "idle" | "completed" | "failed" | "aborted";

export interface SettleSweepCandidate {
  readonly threadId: string;
  /**
   * "completed"/"failed"/"aborted" under the TTL rule; any state under the
   * settled-parent rule, where the child's own terminality is not a gate.
   */
  readonly state: ShellState;
  /** Milliseconds the thread has sat in its current state. */
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
 * Pure candidate selection. A child is a candidate when it is not archived,
 * not already settled, and either (a) its parent is CURRENTLY settled — no
 * terminality or TTL gate, but the same live-work hard skip as the TTL rule:
 * never a child with a running session/turn or live background work — or
 * (b) it is terminal and past the TTL. The state rules mirror
 * `deriveThreadRunState` (packages/shared) — the shared module cannot be
 * imported here without the full ThreadRunStatus derivation the sweep does
 * not need, so the terminal precedence is kept local and total. Remaining
 * live-protection stays in the decider (open blocking work, queued turn
 * starts) — and a child settled here only while its parent still is, via the
 * `requireSettledParentThreadId` precondition.
 */
export function pickSettleSweepCandidates(
  shells: ReadonlyArray<SettleSweepShellLike>,
  childThreadIds: ReadonlySet<string>,
  options: {
    readonly nowMs: number;
    readonly ttlMs: number;
    /**
     * Child ids whose parent is settled at sweep time — recomputed by the
     * sweeper from the same snapshot, so an un-settled parent drops its
     * children out of this set on the very next pass.
     */
    readonly settledParentChildren: ReadonlySet<string>;
  },
): ReadonlyArray<SettleSweepCandidate> {
  const candidates: SettleSweepCandidate[] = [];
  for (const shell of shells) {
    if (shell.archivedAt !== null || shell.settledOverride === "settled") continue;
    if (!childThreadIds.has(shell.id)) continue;
    const state = stateOfShell(shell);
    const stateAtMs = Date.parse(shell.updatedAt);
    if (Number.isNaN(stateAtMs)) continue;
    const ageMs = options.nowMs - stateAtMs;
    if (options.settledParentChildren.has(shell.id)) {
      // Live-work hard skip, identical to the TTL rule: a running session or
      // turn and ANY live background liveness ("working" fleets AND
      // "monitoring" watch loops) must never park inside a settled row. The
      // decider's thread.settle cannot see background liveness, so the gate
      // must hold here — the auto-settle path makes the same call.
      if (state === "running" || shell.backgroundLiveness !== null) continue;
      candidates.push({ threadId: shell.id, state, ageMs });
      continue;
    }
    if (!TERMINAL_STATES.has(state)) continue;
    if (ageMs < options.ttlMs) continue;
    candidates.push({ threadId: shell.id, state, ageMs });
  }
  return candidates;
}

/** Same terminal precedence as `deriveThreadRunState`: session status
 *  outranks turn state; a live background fleet outranks a settled turn. */
export function stateOfShell(
  shell: Pick<SettleSweepShellLike, "session" | "latestTurn" | "backgroundLiveness">,
): ShellState {
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
