import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  ENTER_DURATION,
  FAR_DWELL,
  HIDDEN_SIZER_CLS,
  LOOP_DWELL,
  LOOP_SPEED,
} from "~/components/t3team-ThreadActivityStatus-shared";

/**
 * Slide-mode label (fit-gated, GHE #40): on first appearance the label
 * slides in from the left edge to its start position; then, periodically,
 * it rests, slides to the left just far enough that the RIGHT END of the
 * text docks at the window's right edge, stays there for a while, and
 * slides straight back to the start — repeating. One element, one slow
 * eased pass each way, no text swap, no off-screen phase — the window
 * shows text the whole way.
 */
export function SlideCycleLabel({
  text,
  slideW,
  onLand,
}: {
  text: string;
  slideW: number;
  /** called when the label lands back at its start position */
  onLand?: () => void;
}) {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // natural width of the full label = the scroll-out distance
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [textW, setTextW] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = sizerRef.current;
    if (el) setTextW(el.getBoundingClientRect().width);
  }, [text]);

  const labelRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;
  useEffect(() => {
    const el = labelRef.current;
    if (!el || reduced || slideW <= 0 || textW === undefined || textW <= 0) return;
    let loop: Animation | null = null;
    let landT1 = 0;
    let landInt = 0;
    let loopStartT = 0;
    const fireLand = () => onLandRef.current?.();
    const startLoop = () => {
      // travel, measured from the live geometry (label at rest): exactly how
      // far the right end of the text must move to dock at the window's
      // right edge — sub-pixel exact, no rounding drift
      const labelEl = labelRef.current;
      const winEl = labelEl?.parentElement;
      const travel = Math.max(
        4,
        labelEl
          ? labelEl.getBoundingClientRect().right - (winEl?.getBoundingClientRect().right ?? 0)
          : 0,
      );
      const leg = Math.round((travel / LOOP_SPEED) * 1000); // px / (px/s) * 1000 = ms
      // the label never leaves the window: rest at start → slide left →
      // hold at the far end → straight back to the start → rest → repeat
      const total = leg * 2 + LOOP_DWELL * 2 + FAR_DWELL;
      loop = el.animate(
        [
          { transform: "translateX(0px)", offset: 0 },
          { transform: "translateX(0px)", offset: LOOP_DWELL / total, easing: "ease-in-out" },
          {
            transform: `translateX(${-travel}px)`,
            offset: (LOOP_DWELL + leg) / total,
            easing: "ease-in-out",
          },
          {
            transform: `translateX(${-travel}px)`,
            offset: (LOOP_DWELL + leg + FAR_DWELL) / total,
            easing: "ease-in-out",
          },
          {
            transform: "translateX(0px)",
            offset: (LOOP_DWELL + leg * 2 + FAR_DWELL) / total,
            easing: "ease-in-out",
          },
          { transform: "translateX(0px)" },
        ],
        { duration: total, iterations: Infinity },
      );
      animRef.current = loop;
      // each return to the start position is a "landing" → one icon spin
      landT1 = window.setTimeout(fireLand, total - LOOP_DWELL);
      landInt = window.setInterval(fireLand, total);
    };
    const enter = el.animate(
      [{ transform: `translateX(${-slideW}px)` }, { transform: "translateX(0px)" }],
      {
        duration: ENTER_DURATION,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
    animRef.current = enter;
    enter.onfinish = () => {
      if (animRef.current !== enter) return;
      // start the loop only after the container's width glide has settled
      // (it ends at 0.82s), so the dock distance is measured against the
      // FINAL window width — the label rests at 0 until then
      loopStartT = window.setTimeout(startLoop, 250);
    };
    return () => {
      enter.onfinish = null;
      enter.cancel();
      loop?.cancel();
      window.clearTimeout(landT1);
      window.clearInterval(landInt);
      window.clearTimeout(loopStartT);
      animRef.current = null;
    };
  }, [slideW, reduced, text, textW]);

  return (
    <span
      className="relative block h-4 w-full overflow-hidden"
      title={text}
      onMouseEnter={() => animRef.current?.pause()}
      onMouseLeave={() => animRef.current?.play()}
    >
      {/* natural width of the full label, same classes as the visible text */}
      <span ref={sizerRef} aria-hidden className={HIDDEN_SIZER_CLS}>
        <span className="inline-block whitespace-nowrap">{text}</span>
      </span>
      <span
        ref={labelRef}
        role="status"
        className="t3team-label-shimmer relative inline-block whitespace-nowrap will-change-transform"
      >
        {text}
      </span>
    </span>
  );
}
