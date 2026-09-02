import { useEffect, useState } from "react";

import { SplitFlipText } from "./t3team-splitFlipText";

/**
 * GHE #201 follow-up — the working row's lead text, split.
 *
 * The row renders "<state word> for <timer>". As ONE text run it can neither
 * flip nor resize gracefully: the state word (GHE #208) changes without
 * motion, and the timer's shape changes (9s → 10s, 59s → 1m 0s) yank the
 * dots beside it. Split, each piece gets the production 3D status roll
 * (SplitFlipText) on its own, and the slot's width glides on the shared
 * spring — the dots move WITH the text instead of jumping.
 *
 * SIZING — the slot (`.t3team-aci-lead`) is an inline-flex row that sizes
 * to its text and the outer flex row clamps it. The pieces carry the
 * ellipsis policy (t3team-index.css): the state word — which can be an
 * arbitrary-length LLM label — surrenders ALL the overflow first and
 * ellipsizes ("drop the middle"); the " for " joiner and the timer never
 * shrink, so the duration always survives truncation, down to the point
 * where even the joiner + timer no longer fit. The 480ms
 * `transition: width` glides the slot on content changes (a roll) and on
 * panel resizes (GHE #208 follow-up).
 *
 * No JS width measurement: an earlier version pinned the slot to a px
 * width it read back from the flex layout. Two defects made that a trap —
 * a forced reflow reads the TRANSITION-interpolated width (Blink), so the
 * "full width, then clamp to allocation" dance always read the pre-change
 * width and re-pinned the old value; and once pinned, the slot's own px
 * width was the only thing its parent's width tracked, so a ResizeObserver
 * on the parent never fired when the panel grew and the pin locked the
 * text clipped ("Writing for …" at wide panel widths, 0.0.39 report).
 * Letting the flex layout own the width makes the clamp correct in both
 * directions with no feedback loop.
 *
 * CHOREOGRAPHY — the slot width holds while a piece rolls out (the old
 * text stays mounted) and starts gliding exactly when the incoming text
 * mounts; quiet swaps (plain seconds ticks, no roll) keep the same width
 * (tabular-nums, same digit count) so nothing moves.
 *
 * PERFORMANCE — the 1s tick re-renders only this small component (memo),
 * never the whole row.
 */

export function formatWorkingTimer(startIso: string, endIso: string): string | null {
  const startedAtMs = Date.parse(startIso);
  const endedAtMs = Date.parse(endIso);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatWorkingTimerNow(startIso: string): string {
  return formatWorkingTimer(startIso, new Date().toISOString()) ?? "0s";
}

/** The timer only rolls when the digits on screen actually change shape:
 * the minute/hour part changes, or the digit count changes. A seconds tick
 * inside the same format ("1m 5s" → "1m 6s") updates in place. */
function timerShouldRoll(prev: string, next: string): boolean {
  const stripSeconds = (value: string) => value.replace(/\s?\d+s$/, "");
  return stripSeconds(prev) !== stripSeconds(next) || prev.length !== next.length;
}

export const WorkingLeadText = ({
  stateWord,
  createdAt,
  liveState = false,
  shimmer = false,
}: {
  readonly stateWord: string;
  readonly createdAt: string;
  /**
   * GHE #208 follow-up — the "working" state word is spelled exactly like
   * the no-state fallback ("Working"), so a live working state used to be
   * visually indistinguishable from missing data (the timer was the only
   * cue). When the word comes from the server's deterministic
   * activityState it gets the subtle live emphasis (font-medium); the
   * static fallback word stays at the regular weight. Restrained on
   * purpose: one unified activity row, no new pills.
   */
  readonly liveState?: boolean;
  /**
   * Paint the shimmer on each LEAF piece (state word, " for " joiner,
   * timer). background-clip: text cannot reach text inside nested
   * animated spans through a wrapper — the clip must sit on the element
   * that directly holds the glyphs, or the flip layers paint nothing
   * (P0 white-on-white working-row label).
   */
  readonly shimmer?: boolean;
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const time = formatWorkingTimer(createdAt, new Date(nowMs).toISOString()) ?? "0s";

  const shimmerClass = shimmer ? "t3team-label-shimmer" : undefined;
  // The state word may carry BOTH the live emphasis (font-medium) and the
  // shimmer paint; SplitFlipText takes one className, so join.
  const wordClass =
    [shimmerClass, liveState ? "font-medium" : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <span className="t3team-aci-lead">
      <SplitFlipText
        text={stateWord}
        className={`${wordClass ?? ""} t3team-aci-lead-word`.trim()}
      />
      <span className={`t3team-aci-lead-join ${shimmerClass ?? ""}`.trim()}> for </span>
      <SplitFlipText
        text={time}
        shouldFlip={timerShouldRoll}
        className={`${shimmerClass ?? ""} t3team-aci-lead-timer`.trim()}
      />
    </span>
  );
};
