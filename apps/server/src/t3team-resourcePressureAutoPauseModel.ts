/**
 * Pure auto-pause state machine for the resource-pressure model (flag
 * `NEXI_FF_RESOURCE_PRESSURE`). No I/O, no clock: the monitor feeds it each
 * post-hysteresis level with the sample time, the provider command reactor
 * asks it at every turn start, and the turn-context assembly takes its notes.
 *
 * Phases (documented contract — tests pin them):
 *
 *   running ──critical──▶ pausing ──below critical──▶ cooldown ──cooldown elapsed──▶ running
 *                            ▲                            │
 *                            └────────critical────────────┘
 *
 *  - `pausing`: every NEW turn start is held (the thread is marked paused);
 *    a turn already in flight runs to completion — the gate only acts at the
 *    turn boundary.
 *  - `cooldown`: pressure is below critical but has not stayed there for
 *    {@link AUTO_PAUSE_COOLDOWN_MS}; paused threads keep holding (so their
 *    order is kept), other threads start turns normally.
 *  - leaving `cooldown` resumes every paused thread and queues exactly ONE
 *    resume note per thread ("Paused N s for memory pressure; current level X").
 *
 * Escalation notes: each escalation to warn/critical bumps a sequence number;
 * a thread's next turn while the level is still elevated gets one note per
 * escalation. A resume note counts as the note for the current escalation, so
 * a resumed thread never gets a second note for the same episode.
 */
import type {
  ResourcePressureAutoPausePhase,
  ResourcePressureAutoPauseView,
  ResourcePressureLevel,
} from "@t3tools/contracts";

/** Pressure must stay below critical this long before held turns resume. */
export const AUTO_PAUSE_COOLDOWN_MS = 60_000;

const RANK: Record<ResourcePressureLevel, number> = { ok: 0, warn: 1, critical: 2 };

export interface PausedThreadState {
  readonly pausedAt: number;
  readonly heldTurnCount: number;
}

export interface AutoPauseState {
  readonly phase: ResourcePressureAutoPausePhase;
  readonly level: ResourcePressureLevel;
  readonly belowCriticalSince: number | null;
  readonly paused: ReadonlyMap<string, PausedThreadState>;
  readonly escalationSeq: number;
  readonly notedSeq: ReadonlyMap<string, number>;
  readonly resumeNotes: ReadonlyMap<string, string>;
}

export const INITIAL_AUTO_PAUSE: AutoPauseState = {
  phase: "running",
  level: "ok",
  belowCriticalSince: null,
  paused: new Map(),
  escalationSeq: 0,
  notedSeq: new Map(),
  resumeNotes: new Map(),
};

export interface ResumedThread {
  readonly threadId: string;
  readonly pausedMs: number;
  readonly heldTurnCount: number;
}

export function resumeNote(pausedMs: number, level: ResourcePressureLevel): string {
  return `Paused ${Math.round(pausedMs / 1000)} s for memory pressure; current level ${level}.`;
}

export function escalationNote(level: ResourcePressureLevel): string {
  return `Memory pressure is ${level}; avoid spawning new agents/jobs; finish in-flight work and end the turn.`;
}

/** Feed one post-hysteresis level. Returns the threads to resume now (possibly none). */
export function observeLevel(
  state: AutoPauseState,
  level: ResourcePressureLevel,
  nowMs: number,
  cooldownMs: number = AUTO_PAUSE_COOLDOWN_MS,
): { readonly state: AutoPauseState; readonly resumed: ReadonlyArray<ResumedThread> } {
  const escalated = level !== "ok" && RANK[level] > RANK[state.level];
  const base: AutoPauseState = {
    ...state,
    level,
    escalationSeq: escalated ? state.escalationSeq + 1 : state.escalationSeq,
    // A pending resume note names the level at resume time; a new escalation makes it stale.
    resumeNotes: escalated ? new Map() : state.resumeNotes,
  };
  if (level === "critical") {
    return { state: { ...base, phase: "pausing", belowCriticalSince: null }, resumed: [] };
  }
  if (state.phase === "running") return { state: base, resumed: [] };
  const since = state.belowCriticalSince ?? nowMs;
  if (base.paused.size > 0 && nowMs - since < cooldownMs) {
    return { state: { ...base, phase: "cooldown", belowCriticalSince: since }, resumed: [] };
  }
  const resumed = [...base.paused].map(([threadId, paused]) => ({
    threadId,
    pausedMs: Math.max(0, nowMs - paused.pausedAt),
    heldTurnCount: paused.heldTurnCount,
  }));
  const resumeNotes = new Map(base.resumeNotes);
  for (const thread of resumed)
    resumeNotes.set(thread.threadId, resumeNote(thread.pausedMs, level));
  return {
    state: {
      ...base,
      phase: "running",
      belowCriticalSince: null,
      paused: new Map(),
      resumeNotes,
    },
    resumed,
  };
}

/** Turn-boundary decision: hold while pausing, and keep holding a paused thread through cooldown. */
export function admitTurn(
  state: AutoPauseState,
  threadId: string,
  nowMs: number,
): { readonly state: AutoPauseState; readonly hold: boolean; readonly firstHold: boolean } {
  const existing = state.paused.get(threadId);
  const hold = state.phase === "pausing" || (state.phase === "cooldown" && existing !== undefined);
  if (!hold) return { state, hold: false, firstHold: false };
  const paused = new Map(state.paused);
  paused.set(threadId, {
    pausedAt: existing?.pausedAt ?? nowMs,
    heldTurnCount: (existing?.heldTurnCount ?? 0) + 1,
  });
  return { state: { ...state, paused }, hold: true, firstHold: existing === undefined };
}

/** The one note (if any) the thread's next context assembly carries; consuming it marks it sent. */
export function takeTurnNote(
  state: AutoPauseState,
  threadId: string,
): { readonly state: AutoPauseState; readonly note: string | null } {
  const pending = state.resumeNotes.get(threadId);
  const noted = state.notedSeq.get(threadId) ?? 0;
  const escalationPending = state.level !== "ok" && noted < state.escalationSeq;
  if (pending === undefined && !escalationPending) return { state, note: null };
  const notedSeq = new Map(state.notedSeq);
  notedSeq.set(threadId, state.escalationSeq);
  const resumeNotes = new Map(state.resumeNotes);
  resumeNotes.delete(threadId);
  return {
    state: { ...state, notedSeq, resumeNotes },
    note: pending ?? escalationNote(state.level),
  };
}

export function autoPauseView(
  state: AutoPauseState,
  cooldownMs: number = AUTO_PAUSE_COOLDOWN_MS,
): ResourcePressureAutoPauseView {
  return {
    phase: state.phase,
    cooldownMs,
    resumesAt:
      state.phase === "cooldown" && state.belowCriticalSince !== null
        ? state.belowCriticalSince + cooldownMs
        : null,
    threads: [...state.paused].map(([threadId, paused]) => ({ threadId, ...paused })),
  };
}
