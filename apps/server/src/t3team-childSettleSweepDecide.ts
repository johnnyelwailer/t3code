/**
 * Pure child-settle sweep decision (GHE #304 part A) over V2 thread shells.
 *
 * A child is a thread whose `lineage.relationshipToParent` is `subagent`
 * (delegated children, provider-native subagents, workflow children and
 * children re-linked by the V1 cutover). Upstream never auto-settles them on
 * their own (the settlement-candidate query excludes subagent lineage), so
 * this sweep is how they leave the active rosters. Two rules nominate one:
 *
 * 1. Settled-parent rule: a child of a parent that is settled at sweep time
 *    settles on the next pass, regardless of its terminality and the TTL.
 *    Its settle command carries the settled-parent command-id prefix, which
 *    the fork settle guard re-checks at decide time, so a parent that
 *    un-settles between the snapshot and the decision wins the race.
 * 2. TTL rule: a terminal child (latest run completed/failed/interrupted/
 *    cancelled) settles once it has sat terminal past the TTL.
 *
 * Both rules hard-skip a child with live work: an active run, pending
 * background work or a pending runtime request. The orchestrator re-checks
 * active runs and blocking requests itself, and `thread.auto-settle` refuses
 * any thread that changed after the snapshot or carries an explicit override
 * (including a user's "keep active"), so settling here is always bookkeeping,
 * never a stop.
 * @module t3team-childSettleSweepDecide
 */
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Default child-settle TTL: a terminal child settles 48h after it went terminal. */
export const CHILD_SETTLE_TTL_MS = 48 * 60 * 60 * 1_000;
/** Default sweep cadence: 5 minutes (a cheap shell scan; the scheduler ticks every 5 s). */
export const CHILD_SETTLE_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
/** After a refused or failed settle the same child is not re-nominated for this long:
 *  every attempt persists a rejected receipt (fresh command ids never dedupe). */
const CHILD_SETTLE_RETRY_BLOCK_MS = 60 * 60 * 1_000;
/** After a restart the in-memory retry blocks are gone; attempts in this window are spread
 *  across passes by a stable per-child phase instead of firing in one burst. */
export const CHILD_SETTLE_STARTUP_GRACE_MS = 4 * CHILD_SETTLE_SWEEP_INTERVAL_MS;
const CHILD_SETTLE_STARTUP_STAGGER = 4;

/** Command-id prefix of settled-parent settles; the settle guard requires the parent settled. */
export const SETTLED_PARENT_SETTLE_COMMAND_PREFIX = "server:child-settle-sweeper:settled-parent:";
/** Command-id prefix of TTL settles. */
export const TTL_SETTLE_COMMAND_PREFIX = "server:child-settle-sweeper:ttl:";

function envMs(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs;
}

export const childSettleTtlMs = () => envMs("T3TEAM_CHILD_SETTLE_TTL_MS", CHILD_SETTLE_TTL_MS);
export const childSettleSweepIntervalMs = () =>
  envMs("T3TEAM_CHILD_SETTLE_SWEEP_INTERVAL_MS", CHILD_SETTLE_SWEEP_INTERVAL_MS);
export const childSettleRetryBlockMs = () =>
  envMs("T3TEAM_CHILD_SETTLE_RETRY_BLOCK_MS", CHILD_SETTLE_RETRY_BLOCK_MS);
export const childSettleStartupGraceMs = () =>
  envMs("T3TEAM_CHILD_SETTLE_STARTUP_GRACE_MS", CHILD_SETTLE_STARTUP_GRACE_MS);

/**
 * Stable per-child dispatch phase for the startup grace: FNV-1a over the thread id gives
 * each child a fixed slot in [0, STAGGER); it may dispatch only when the pass slot matches.
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

export type SettleSweepShell = Pick<
  OrchestrationV2ThreadShell,
  | "id"
  | "lineage"
  | "archivedAt"
  | "settledOverride"
  | "updatedAt"
  | "latestRunCompletedAt"
  | "status"
  | "activityRunStatus"
  | "pendingBackgroundTasks"
  | "pendingRuntimeRequest"
>;

export interface SettleSweepCandidate {
  readonly threadId: SettleSweepShell["id"];
  readonly rule: "settled-parent" | "ttl";
  /** The shell's `updatedAt`: `thread.auto-settle` refuses a thread changed after it. */
  readonly snapshotAt: DateTime.Utc;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
]);

export const isSubagentChild = (shell: Pick<SettleSweepShell, "lineage">) =>
  shell.lineage.parentThreadId !== null && shell.lineage.relationshipToParent === "subagent";

/** Live work the sweep never settles over (the same signals upstream's Waiting pill reads). */
export const hasLiveWork = (shell: SettleSweepShell) =>
  (shell.activityRunStatus ?? null) !== null ||
  (shell.pendingBackgroundTasks?.length ?? 0) > 0 ||
  shell.pendingRuntimeRequest !== null;

/** When the child went terminal: its latest run's completion, else its last change. */
const terminalSinceMs = (shell: SettleSweepShell) =>
  DateTime.toEpochMillis(shell.latestRunCompletedAt ?? shell.updatedAt);

export function pickSettleSweepCandidates(
  shells: ReadonlyArray<SettleSweepShell>,
  options: { readonly nowMs: number; readonly ttlMs: number },
): ReadonlyArray<SettleSweepCandidate> {
  // Read from THIS pass's snapshot: a parent that un-settles stops being a reason at once.
  const settledParentIds = new Set(
    shells.filter((shell) => shell.settledOverride === "settled").map((shell) => shell.id),
  );
  const candidates: SettleSweepCandidate[] = [];
  for (const shell of shells) {
    if (!isSubagentChild(shell) || shell.archivedAt !== null) continue;
    // Any explicit override (settled, or a user's "keep active") is final for auto-settle.
    if (shell.settledOverride !== null || hasLiveWork(shell)) continue;
    const base = { threadId: shell.id, snapshotAt: shell.updatedAt };
    if (settledParentIds.has(shell.lineage.parentThreadId!)) {
      candidates.push({ ...base, rule: "settled-parent" });
      continue;
    }
    if (!TERMINAL_STATUSES.has(shell.status)) continue;
    if (options.nowMs - terminalSinceMs(shell) < options.ttlMs) continue;
    candidates.push({ ...base, rule: "ttl" });
  }
  return candidates;
}
