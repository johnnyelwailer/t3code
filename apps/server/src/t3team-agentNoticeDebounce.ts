/**
 * Debounce for agent notices (flag `NEXI_FF_RESOURCE_PRESSURE`): a note on a level crossing, a
 * recovery (also when the condition disappears) or a burn rate up by half; silence inside the quiet
 * window, except an escalation to critical.
 *
 * @module t3team-agentNoticeDebounce
 */
import {
  DEFAULT_NOTICE_THRESHOLDS,
  PACE_RISE_FACTOR,
  type NoticeCandidate,
  type NoticeLevel,
} from "./t3team-agentNoticeEngine.ts";

const NOTICE_QUIET_MS = DEFAULT_NOTICE_THRESHOLDS.quietMs;

interface NoticeMemory {
  readonly level: NoticeLevel;
  readonly recoveredText: string;
  readonly magnitude: number;
  readonly notedAtMs: number;
}

const RANK: Record<NoticeLevel, number> = { ok: 0, warn: 1, critical: 2 };

export interface NoticeDebouncer {
  /** The note texts to deliver to `recipient` now; updates what was last told. */
  readonly take: (
    recipient: string,
    candidates: ReadonlyArray<NoticeCandidate>,
    nowMs: number,
    quietMs?: number,
  ) => string[];
}

export const createNoticeDebouncer = (
  defaultQuietMs: number = NOTICE_QUIET_MS,
): NoticeDebouncer => {
  const memory = new Map<string, NoticeMemory>();
  const take: NoticeDebouncer["take"] = (
    recipient,
    candidates,
    nowMs,
    quietMs = defaultQuietMs,
  ) => {
    const notes: string[] = [];
    for (const candidate of candidates) {
      const id = `${recipient}\u0000${candidate.key}`;
      const last = memory.get(id);
      const lastLevel = last?.level ?? "ok";
      const quiet = last !== undefined && nowMs - last.notedAtMs < quietMs;
      const escalated = RANK[candidate.level] > RANK[lastLevel];
      const toCritical = escalated && candidate.level === "critical";
      const recovered = candidate.level === "ok" && lastLevel !== "ok";
      const paceRose =
        candidate.level !== "ok" &&
        candidate.level === lastLevel &&
        last !== undefined &&
        last.magnitude > 0 &&
        candidate.magnitude >= last.magnitude * PACE_RISE_FACTOR;
      if (recovered) {
        notes.push(candidate.recoveredText);
        memory.set(id, { ...last!, level: "ok", magnitude: 0, notedAtMs: nowMs });
      } else if (toCritical || ((escalated || paceRose) && !quiet)) {
        notes.push(candidate.text);
        memory.set(id, {
          level: candidate.level,
          recoveredText: candidate.recoveredText,
          magnitude: candidate.magnitude,
          notedAtMs: nowMs,
        });
      } else if (last !== undefined && RANK[candidate.level] < RANK[lastLevel]) {
        memory.set(id, { ...last, level: candidate.level });
      }
    }
    const present = new Set(candidates.map((candidate) => `${recipient}\u0000${candidate.key}`));
    for (const [id, last] of memory) {
      if (!id.startsWith(`${recipient}\u0000`) || present.has(id) || last.level === "ok") continue;
      notes.push(last.recoveredText);
      memory.set(id, { ...last, level: "ok", magnitude: 0, notedAtMs: nowMs });
    }
    return notes;
  };
  return { take };
};

export const noticeBlock = (notes: ReadonlyArray<string>): string | null =>
  notes.length === 0 ? null : notes.map((note) => `[host] ${note}`).join("\n");
