import * as DateTime from "effect/DateTime";

/**
 * Canonical coalescing gate for terminal/watch/notice emissions (GHE #157
 * family, follow-up to #256/#269): one shared quiet-window dedup at the
 * notification emission boundary.
 *
 * A single terminal episode can reach a recipient more than once through paths
 * the durable per-key ledger does not merge: a re-watch minting a fresh watchId
 * for an already-terminal target, and a restart re-resolving the same episode
 * after rehydration. This gate keys on (recipient thread, notice kind, episode)
 * with a bounded quiet window, so a repeat for the SAME episode within the
 * window is dropped while a genuinely new episode (a later stop) still
 * delivers. It is an OUTER coalescer: the durable ledger remains the epoch
 * re-arm source of truth; this gate only collapses the rapid repeats the
 * ledger's per-key view lets through. The inter-agent digest inherits the
 * reduction: fewer notices reach the mailbox, so the framed batch is smaller -
 * no digest-specific branch.
 *
 * Pure and deterministic: the clock is injectable (no real timers).
 *
 * @module t3team-terminalNoticeGate
 */
export type TerminalNoticeKind = "terminal" | "abnormal-stop" | "completed";

export interface TerminalNoticeEpisode {
  /** The thread that would receive the notice (the watcher / the parent). */
  readonly recipientThreadId: string;
  readonly kind: TerminalNoticeKind;
  /** Stable identity of the underlying terminal episode (the observed thread's stop). */
  readonly episodeId: string;
}

export interface TerminalNoticeGate {
  /**
   * True when the notice for `episode` should be delivered now; false when an
   * identical (recipient, kind, episode) notice was delivered within the quiet
   * window. The first delivery for an episode always passes.
   */
  readonly allow: (episode: TerminalNoticeEpisode) => boolean;
  /** Drop all suppression state. */
  readonly reset: () => void;
}

/**
 * Default quiet window: long enough to swallow re-watch / re-hydrate repeats of
 * a terminal episode, short enough that a genuinely new stop after a quiet
 * period still reports.
 */
export const TERMINAL_NOTICE_QUIET_MS_DEFAULT = 120_000;

export interface TerminalNoticeGateDeps {
  /** Injectable clock in ms; deterministic in tests. Defaults to wall clock. */
  readonly nowMs?: () => number;
  /** Quiet window in ms. Defaults to {@link TERMINAL_NOTICE_QUIET_MS_DEFAULT}. */
  readonly quietMs?: number;
}

export const makeTerminalNoticeGate = (
  deps: TerminalNoticeGateDeps = {},
): TerminalNoticeGate => {
  const nowMs = deps.nowMs ?? (() => DateTime.nowUnsafe().epochMilliseconds);
  const quietMs = deps.quietMs ?? TERMINAL_NOTICE_QUIET_MS_DEFAULT;
  const lastByEpisode = new Map<string, number>();
  const keyOf = (episode: TerminalNoticeEpisode): string =>
    `${episode.recipientThreadId}\u0000${episode.kind}\u0000${episode.episodeId}`;
  return {
    allow: (episode) => {
      const key = keyOf(episode);
      const last = lastByEpisode.get(key);
      if (last !== undefined && nowMs() - last < quietMs) return false;
      lastByEpisode.set(key, nowMs());
      return true;
    },
    reset: () => {
      lastByEpisode.clear();
    },
  };
};
