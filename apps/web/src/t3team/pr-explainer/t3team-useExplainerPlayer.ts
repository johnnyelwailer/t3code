import { useMediaQuery } from "./t3team-explainerHostKit";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

export const EXPLAINER_SPEEDS = [0.75, 1, 1.5, 2] as const;
export type ExplainerSpeed = (typeof EXPLAINER_SPEEDS)[number];

/** How long one step stays up at 1×. */
export const EXPLAINER_STEP_MS = 6500;

/** Why autoplay is holding: each source clears only itself. */
export type ExplainerHoldReason = "hover" | "focus" | "ask";

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Whether focus is in the step rail, so ↑/↓ never take the page's scroll from the content. */
function inRail(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-xp-rail]") !== null;
}

/**
 * The player's state: the current step, autoplay, speed, and the holds that pause it. The step
 * clock is a timer here — the rail's fill only draws it — so it runs at any width. It counts
 * only while `running`, keeps its place across holds, and restarts on a new step or speed.
 *
 * `stepCount` may grow while an explainer streams in; at the last step autoplay waits for more
 * when `streaming`, and stops otherwise. `inView` is false off screen or in a hidden tab.
 */
export function useExplainerPlayer(input: {
  readonly stepCount: number;
  readonly streaming?: boolean;
  readonly initialIndex?: number;
  readonly autoPlay?: boolean;
  readonly inView?: boolean;
  /** One step at 1×. */
  readonly stepMs?: number;
  /** The rail is a vertical list: ↑/↓ step through it while focus is in the rail. */
  readonly vertical?: boolean;
}) {
  const { stepCount, streaming = false, inView = true } = input;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [rawIndex, setIndex] = useState(input.initialIndex ?? 0);
  // Reduced motion: never start moving on its own; the reader presses play.
  const [playing, setPlaying] = useState((input.autoPlay ?? false) && !reducedMotion);
  const [speed, setSpeed] = useState<ExplainerSpeed>(1);
  const [holds, setHolds] = useState<ReadonlySet<ExplainerHoldReason>>(() => new Set());
  const [direction, setDirection] = useState<1 | -1>(1);

  const last = Math.max(0, stepCount - 1);
  const index = Math.min(rawIndex, last);
  const atEnd = index >= last;
  const stepMs = (input.stepMs ?? EXPLAINER_STEP_MS) / speed;
  const clockKey = `${index}:${stepMs}`;
  // The clock that ran out on the last step while more steps are still being written.
  const [expiredKey, setExpiredKey] = useState<string | null>(null);
  const waitingForStep = playing && atEnd && streaming && expiredKey === clockKey;
  const running = playing && holds.size === 0 && !waitingForStep && inView && stepCount > 0;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, last));
      setDirection(clamped < index ? -1 : 1);
      setIndex(clamped);
    },
    [index, last],
  );

  // Time spent on this step and speed so far. A new step or speed starts it from zero; any other
  // re-run (a hold, a streamed step) resumes where it was.
  const elapsed = useRef({ key: "", ms: 0 });
  useEffect(() => {
    if (!running) return;
    if (elapsed.current.key !== clockKey) elapsed.current = { key: clockKey, ms: 0 };
    const startedAt = Date.now();
    const timer = window.setTimeout(
      () => {
        if (index < last) go(index + 1);
        else if (streaming) setExpiredKey(clockKey);
        else setPlaying(false);
      },
      Math.max(0, stepMs - elapsed.current.ms),
    );
    return () => {
      window.clearTimeout(timer);
      if (elapsed.current.key === clockKey) elapsed.current.ms += Date.now() - startedAt;
    };
  }, [clockKey, go, index, last, running, stepMs, streaming]);

  const hold = useCallback((reason: ExplainerHoldReason, on: boolean) => {
    setHolds((current) => {
      if (current.has(reason) === on) return current;
      const next = new Set(current);
      if (on) next.add(reason);
      else next.delete(reason);
      return next;
    });
  }, []);

  const togglePlay = useCallback(() => {
    if (!playing && atEnd && !streaming) {
      // Play from the end starts the tour over.
      elapsed.current = { key: "", ms: 0 };
      if (last > 0) go(0);
    }
    setPlaying(!playing);
  }, [atEnd, go, last, playing, streaming]);

  /** ←/→/Home/End (and ↑/↓ in a vertical rail). Returns whether it moved, so the caller can keep focus in the player. */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return false;
      if (event.altKey || event.metaKey || event.ctrlKey) return false;
      if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
      else if (input.vertical && event.key === "ArrowDown" && inRail(event.target)) go(index + 1);
      else if (input.vertical && event.key === "ArrowUp" && inRail(event.target)) go(index - 1);
      else if (event.key === "Home") go(0);
      else if (event.key === "End") go(last);
      else return false;
      setPlaying(false);
      event.preventDefault();
      return true;
    },
    [go, index, input.vertical, last],
  );

  return {
    index,
    direction,
    playing,
    /** The clock is counting: playing, nothing holds it, and the player is in view. */
    running,
    held: holds.size > 0,
    waitingForStep,
    stepMs,
    clockKey,
    speed,
    setSpeed,
    reducedMotion,
    go,
    goAndPause: (next: number) => {
      setPlaying(false);
      go(next);
    },
    hold,
    togglePlay,
    onKeyDown,
  };
}

export type ExplainerPlayerState = ReturnType<typeof useExplainerPlayer>;
