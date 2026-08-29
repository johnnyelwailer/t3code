// @effect-diagnostics globalDate:off -- ages are wall-clock comparisons over
// persisted ISO stamps.
/**
 * Counter-driven orchestrator cleanup nudge (GHE #304 part C) — pure logic.
 *
 * When a parent's UNSETTLED terminal children cross the threshold, the parent
 * gets ONE compact digest: the reminder-of-discarded-work surface. The digest
 * instructs the parent to DELEGATE a cleanup pass (dedicated cleanup child or
 * workflow): verify each child's state (final result / discarded work /
 * unpushed work in worktrees), then settle them in bulk via the `sweep` op.
 * The live reactor + delivery live in t3team-childCleanupNudgeReactor.ts.
 *
 * @module t3team-childCleanupNudge
 */
import { type OrchestrationEvent } from "@t3tools/contracts";
import { stateOfShell, type SettleSweepShellLike } from "./t3team-childSettleSweeper.ts";

/** Default nudge threshold: 10 unsettled terminal children. */
export const CHILD_CLEANUP_NUDGE_AT = 10;
/** Minimum gap between nudges to the same parent: 12h. */
export const CHILD_CLEANUP_NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1_000;
/** Durable dedup marker on the parent thread (the nudge's own record). */
export const CHILD_CLEANUP_NUDGED_KIND = "t3team.child_cleanup.nudged";
/** How many entries the digest lists, top by age (PJ's spec name). */
export const NUDGE_DIGEST_MAX = 20;

function envPositive(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function childCleanupNudgeAt(): number {
  return envPositive("T3TEAM_CHILD_CLEANUP_NUDGE_AT", CHILD_CLEANUP_NUDGE_AT);
}

export function childCleanupNudgeCooldownMs(): number {
  return envPositive("T3TEAM_CHILD_CLEANUP_NUDGE_COOLDOWN_MS", CHILD_CLEANUP_NUDGE_COOLDOWN_MS);
}

export function formatAgeMs(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1_000))}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

/** Compact "3d" age for the digest's top entries (floor, not round: a thread
 *  is "2d old" until it is actually 3d old). */
function digestAge(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  return formatAgeMs(ms);
}

export interface CleanupNudgeStats {
  readonly count: number;
  readonly completed: number;
  readonly failed: number;
  readonly aborted: number;
  readonly oldestAgeMs: number;
  /** Top by age, oldest first, capped at NUDGE_DIGEST_MAX. */
  readonly top: ReadonlyArray<{
    readonly threadId: string;
    readonly title: string;
    readonly state: string;
    readonly ageMs: number;
  }>;
}

/**
 * Count the parent's unsettled terminal children and shape the digest. The
 * caller decides whether to nudge (threshold + cooldown, see
 * cleanupNudgeDue); this is the pure aggregation over shells.
 */
export function terminalUnsettledChildStats(
  shells: ReadonlyArray<SettleSweepShellLike & { readonly title: string }>,
  nowMs: number,
): CleanupNudgeStats {
  let completed = 0;
  let failed = 0;
  let aborted = 0;
  const terminal: Array<{
    readonly threadId: string;
    readonly title: string;
    readonly state: string;
    readonly ageMs: number;
  }> = [];
  for (const shell of shells) {
    if (shell.settledOverride === "settled" || shell.archivedAt !== null) continue;
    const state = stateOfShell(shell);
    if (state === "completed") completed += 1;
    else if (state === "failed") failed += 1;
    else if (state === "aborted") aborted += 1;
    else continue;
    const ageMs = nowMs - Date.parse(shell.updatedAt);
    terminal.push({
      threadId: shell.id,
      title: shell.title,
      state,
      ageMs: Number.isFinite(ageMs) ? Math.max(0, ageMs) : 0,
    });
  }
  terminal.sort((a, b) => b.ageMs - a.ageMs);
  return {
    count: terminal.length,
    completed,
    failed,
    aborted,
    oldestAgeMs: terminal.length > 0 ? (terminal[0]!.ageMs as number) : 0,
    top: terminal.slice(0, NUDGE_DIGEST_MAX),
  };
}

/**
 * The digest message body — one compact line set, no per-thread chrome.
 */
export function buildCleanupNudgeText(stats: CleanupNudgeStats): string {
  const top = stats.top
    .map((entry, i) => `${i + 1}. '${entry.title}' (${entry.state}, ${digestAge(entry.ageMs)})`)
    .join(" ");
  return (
    `[Child cleanup reminder] ${stats.count} child threads have reached terminal state ` +
    `(${stats.completed} completed, ${stats.failed} failed, ${stats.aborted} aborted; ` +
    `oldest ${digestAge(stats.oldestAgeMs)} ago). Top ${stats.top.length} by age: ${top}. ` +
    `Consider delegating a cleanup pass: verify each state (final result / discarded work / ` +
    `unpushed work in worktrees), then settle them in bulk with ` +
    `t3team_children({ op: "sweep" }).`
  );
}

export interface CleanupNudgeRecord {
  readonly atMs: number;
  /** The unsettled-terminal count at the last nudge. */
  readonly nudgedCount: number;
}

/**
 * Dedup/cooldown: at most one nudge per parent per 12h, or re-trigger only
 * when the count crosses the NEXT multiple of the threshold. `last` is the
 * parent's most recent `t3team.child_cleanup.nudged` activity (if any).
 */
export function cleanupNudgeDue(input: {
  readonly count: number;
  readonly threshold: number;
  readonly cooldownMs: number;
  readonly nowMs: number;
  readonly last?: CleanupNudgeRecord | null;
}): boolean {
  if (input.count < input.threshold) return false;
  if (input.last === null || input.last === undefined) return true;
  const nextMultiple = (Math.floor(input.last.nudgedCount / input.threshold) + 1) * input.threshold;
  if (input.count >= nextMultiple) return true;
  return input.nowMs - input.last.atMs >= input.cooldownMs && input.count >= input.threshold;
}

/**
 * Rehydrate per-parent dedup state from a persisted event replay: the newest
 * `t3team.child_cleanup.nudged` activity per parent wins. Mirrors the
 * child-wait index rehydration pattern (collect from the replayed stream).
 */
export function collectLastCleanupNudges(
  events: ReadonlyArray<OrchestrationEvent>,
): ReadonlyMap<string, CleanupNudgeRecord> {
  const lastByParent = new Map<string, CleanupNudgeRecord>();
  for (const event of events) {
    if (event.type !== "thread.activity-appended") continue;
    const activity = event.payload.activity;
    if (activity.kind !== CHILD_CLEANUP_NUDGED_KIND) continue;
    const payload = activity.payload as
      | { readonly at?: unknown; readonly count?: unknown }
      | null
      | undefined;
    if (!payload || typeof payload.at !== "string") continue;
    const atMs = Date.parse(payload.at);
    if (!Number.isFinite(atMs)) continue;
    const count =
      typeof payload.count === "number" && Number.isFinite(payload.count)
        ? Math.floor(payload.count)
        : 0;
    lastByParent.set(event.payload.threadId, { atMs, nudgedCount: count });
  }
  return lastByParent;
}
