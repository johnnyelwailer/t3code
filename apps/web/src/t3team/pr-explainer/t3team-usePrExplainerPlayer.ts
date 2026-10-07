import { useCallback, useState, type KeyboardEvent } from "react";

import { useMediaQuery } from "~/hooks/useMediaQuery";

export const PR_EXPLAINER_SPEEDS = [0.75, 1, 1.5, 2] as const;
export type PrExplainerSpeed = (typeof PR_EXPLAINER_SPEEDS)[number];

/** How long one step stays up at 1×. The rail's progress fill is the clock. */
const BASE_STEP_MS = 6500;

/** Why autoplay is holding: each source clears only itself. */
export type PrExplainerHoldReason = "hover" | "focus" | "ask";

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The player's state: the current step, autoplay, speed and the holds that pause it.
 * `stepCount` may grow while an explainer streams in; at the last step autoplay waits for more
 * when `streaming`, and stops otherwise.
 */
export function usePrExplainerPlayer(input: {
  readonly stepCount: number;
  readonly streaming?: boolean;
  readonly initialIndex?: number;
  readonly autoPlay?: boolean;
}) {
  const { stepCount, streaming = false } = input;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [rawIndex, setIndex] = useState(input.initialIndex ?? 0);
  // Reduced motion: never start moving on its own; the reader presses play.
  const [playing, setPlaying] = useState((input.autoPlay ?? false) && !reducedMotion);
  const [speed, setSpeed] = useState<PrExplainerSpeed>(1);
  const [holds, setHolds] = useState<ReadonlySet<PrExplainerHoldReason>>(() => new Set());
  const [direction, setDirection] = useState<1 | -1>(1);

  const last = Math.max(0, stepCount - 1);
  const index = Math.min(rawIndex, last);
  const atEnd = index >= last;
  const waitingForStep = playing && atEnd && streaming;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, last));
      setDirection(clamped < index ? -1 : 1);
      setIndex(clamped);
    },
    [index, last],
  );

  const hold = useCallback((reason: PrExplainerHoldReason, on: boolean) => {
    setHolds((current) => {
      if (current.has(reason) === on) return current;
      const next = new Set(current);
      if (on) next.add(reason);
      else next.delete(reason);
      return next;
    });
  }, []);

  /** Called when the active step's progress fill completes. */
  const onStepElapsed = useCallback(() => {
    if (index < last) go(index + 1);
    else if (!streaming) setPlaying(false);
  }, [go, index, last, streaming]);

  const togglePlay = useCallback(() => {
    // Play from the end starts the tour over.
    if (!playing && atEnd && !streaming && last > 0) go(0);
    setPlaying(!playing);
  }, [atEnd, go, last, playing, streaming]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
      else if (event.key === "Home") go(0);
      else if (event.key === "End") go(last);
      else return;
      setPlaying(false);
      event.preventDefault();
    },
    [go, index, last],
  );

  return {
    index,
    direction,
    playing,
    /** Playing and nothing holds it: the progress fill runs. */
    running: playing && holds.size === 0 && !waitingForStep,
    held: holds.size > 0,
    waitingForStep,
    stepMs: BASE_STEP_MS / speed,
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
    onStepElapsed,
    onKeyDown,
  };
}

export type PrExplainerPlayerState = ReturnType<typeof usePrExplainerPlayer>;
