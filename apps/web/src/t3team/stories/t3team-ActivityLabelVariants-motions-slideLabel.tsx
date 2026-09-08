/**
 * GHE-40 activity label — story support: the long-label slide cycle
 * (fit-gate slide mode).
 *
 * Split from t3team-ActivityLabelVariants-motions.tsx (LOC ceiling).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The long-label cycle (fit-gate slide mode). The label DEFAULTS to a
 * plain static, truncated label; a while in (not immediately) it starts
 * one slow roll showing the full text, then rolls into the generic
 * "Working", rests there, and rolls back into the label. Same roll
 * choreography as the short labels (no overlap: out finishes before in
 * starts). Under prefers-reduced-motion the roll is skipped entirely —
 * just the static truncated label.
 */
export function SlideCycleLabel({
  text,
  slideW,
  onLand,
}: {
  text: string;
  slideW: number;
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
      const leg = Math.round((travel / 30) * 1000); // px / (px/s) * 1000 = ms
      // the label never leaves the window: rest at start → slide left →
      // hold at the far end → straight back to the start → rest → repeat
      const total = leg * 2 + 4000 * 2 + 4000; // 4000 = hold at the far end
      loop = el.animate(
        [
          { transform: "translateX(0px)", offset: 0 },
          { transform: "translateX(0px)", offset: 4000 / total, easing: "ease-in-out" },
          {
            transform: `translateX(${-travel}px)`,
            offset: (4000 + leg) / total,
            easing: "ease-in-out",
          },
          {
            transform: `translateX(${-travel}px)`,
            offset: (4000 + leg + 4000) / total,
            easing: "ease-in-out",
          },
          {
            transform: "translateX(0px)",
            offset: (4000 + leg * 2 + 4000) / total,
            easing: "ease-in-out",
          },
          { transform: "translateX(0px)" },
        ],
        { duration: total, iterations: Infinity },
      );
      animRef.current = loop;
      // each return to the start position is a "landing" → one icon spin
      landT1 = window.setTimeout(fireLand, total - 4000);
      landInt = window.setInterval(fireLand, total);
    };
    const enter = el.animate(
      [{ transform: `translateX(${-slideW}px)` }, { transform: "translateX(0px)" }],
      { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
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
      <span
        ref={sizerRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
      >
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
