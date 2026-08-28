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
}: {
  readonly stateWord: string;
  readonly createdAt: string;
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
    sizer.textContent = `${stateWord} for ${time}`;
    const target = sizer.getBoundingClientRect().width;
    if (target > 0) slot.style.width = `${target}px`;
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
  }, [stateWord, time]);

  const onPhase = (phase: "idle" | "out" | "in") => {
    rollingRef.current = phase === "out";
    if (phase === "in") applyWidth();
  };

  return (
    <span ref={slotRef} className="t3team-aci-lead">
      <SplitFlipText text={stateWord} onPhaseChange={onPhase} />
      <span> for </span>
      <SplitFlipText text={time} shouldFlip={timerShouldRoll} onPhaseChange={onPhase} />
      <span ref={sizerRef} className="t3team-aci-lead-sizer" aria-hidden />
    </span>
  );
};
