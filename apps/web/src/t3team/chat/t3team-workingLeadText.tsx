import { useEffect, useRef, useState } from "react";

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
 * CHOREOGRAPHY — the slot width holds while a piece rolls out and starts
 * gliding exactly when the incoming text mounts; quiet swaps (plain
 * seconds ticks, no roll) apply the width immediately.
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

  const slotRef = useRef<HTMLSpanElement | null>(null);
  const sizerRef = useRef<HTMLSpanElement | null>(null);
  const rollingRef = useRef(false);
  const prevTextRef = useRef({ stateWord, time });

  const applyWidth = () => {
    const slot = slotRef.current;
    const sizer = sizerRef.current;
    if (!slot || !sizer) return;
    // The sizer mirrors the rendered pieces EXACTLY (word at the live
    // weight, the rest regular) so the measured full width matches the
    // layout — a single all-medium measurement would overestimate by a
    // couple of px and the allocation check below would misfire.
    let wordSpan = sizer.children.item(0) as HTMLElement | null;
    let restSpan = sizer.children.item(1) as HTMLElement | null;
    if (!wordSpan || !restSpan) {
      sizer.textContent = "";
      wordSpan = document.createElement("span");
      restSpan = document.createElement("span");
      sizer.append(wordSpan, restSpan);
    }
    wordSpan.textContent = stateWord;
    wordSpan.style.fontWeight = liveState ? "500" : "";
    restSpan.textContent = ` for ${time}`;
    const full = sizer.getBoundingClientRect().width;
    if (full <= 0) return;
    // Narrow-panel last resort (GHE #208 follow-up): the lead is the
    // last-resort flex shrink point, and its final width can only be known
    // from the flex layout itself — an inline-block auto width does NOT
    // clamp inside this auto-basis flex item (measured in Blink). So:
    // hand the lead its FULL px width, let the row reflow (the clientWidth
    // read below forces the layout), then read how much space the flex row
    // actually allocated to the lead. Wide panels: the allocation equals
    // the full text, the slot keeps its px width — which the 480ms width
    // glide needs. Narrow panels: the allocation is smaller, the slot takes
    // it, and the timer ellipsizes (the .t3team-aci-lead overflow handling)
    // instead of hard-clipping at the row wrapper's overflow-x-clip.
    // No percentage max-width in the CSS: it resolves circular against the
    // auto-basis flex item that contains the lead and corrupts the sizing
    // even when wide.
    // GHE #236 follow-up: leadItem.clientWidth is the slot's entire share —
    // the pre-#236 leading "..." pulses no longer sit beside the clamp,
    // so nothing is subtracted from the allocation.
    slot.style.width = `${full}px`;
    const leadItem = slot.parentElement?.parentElement;
    const allocated = leadItem ? leadItem.clientWidth : full;
    slot.style.width = `${Math.max(0, Math.min(full, allocated))}px`;
  };

  useEffect(() => {
    const prev = prevTextRef.current;
    prevTextRef.current = { stateWord, time };
    const wordRolls = stateWord !== prev.stateWord;
    const timeRolls = time !== prev.time && timerShouldRoll(prev.time, time);
    if (wordRolls || timeRolls) {
      rollingRef.current = true; // hold; the width glides when the text mounts
      return;
    }
    applyWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateWord, time, liveState]);

  // A panel resize never changes the text, so the effect above does not run
  // for it: wide → narrow must move the lead onto the CSS ellipsis, and
  // narrow → wide must hand the px width (and the glide) back.
  // GHE #236 follow-up: observe the LEAD ITEM's allocation, not the row box
  // — when the siblings (agent dots, the step label) take or give space,
  // the lead item's width changes even though the row box does not, and a
  // px width clamped during that transient must re-measure and re-expand
  // (the "Fixing stale status for 2m 4..." ellipsis that stayed clipped
  // with agent dots on the row). Convergent: applyWidth's own width write
  // changes the lead item once more, the observer re-fires, and the second
  // pass is a no-op (slot already at min(full, allocated)).
  const applyWidthRef = useRef(applyWidth);
  useEffect(() => {
    applyWidthRef.current = applyWidth;
  });
  useEffect(() => {
    const slot = slotRef.current;
    const leadItem = slot?.parentElement?.parentElement;
    if (!leadItem || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => applyWidthRef.current());
    observer.observe(leadItem);
    return () => observer.disconnect();
  }, []);

  const onPhase = (phase: "idle" | "out" | "in") => {
    rollingRef.current = phase === "out";
    if (phase === "in") applyWidth();
  };

  const shimmerClass = shimmer ? "t3team-label-shimmer" : undefined;
  // The state word may carry BOTH the live emphasis (font-medium) and the
  // shimmer paint; SplitFlipText takes one className, so join.
  const wordClass =
    [shimmerClass, liveState ? "font-medium" : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <span ref={slotRef} className="t3team-aci-lead">
      <SplitFlipText text={stateWord} onPhaseChange={onPhase} className={wordClass} />
      <span className={shimmerClass}> for </span>
      <SplitFlipText
        text={time}
        shouldFlip={timerShouldRoll}
        onPhaseChange={onPhase}
        className={shimmerClass}
      />
      <span ref={sizerRef} className="t3team-aci-lead-sizer" aria-hidden />
    </span>
  );
};
