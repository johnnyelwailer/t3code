import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";

/*
 * GHE #40 — live activity label motion language (approved in the Storybook
 * exploration, `t3team-ActivityLabelVariants.stories.tsx`).
 *
 * Rules, as settled:
 *   - ONLY TEXT ROLLS. Never the icon. Choreographed, no overlap: the
 *     outgoing label flips away (0.3s) → a beat → the width glide moves the
 *     icon into place (0.42–0.82s) → the incoming label flips in (0.78s) →
 *     the icon's one-shot springy spin (~1.05s).
 *   - The timer is anchored at the container's right edge: it never shifts
 *     when the incoming label's width lands.
 *   - Kind change (live → done): the text still rolls and the icon MORPHS
 *     where it sits (dashed ring → solid ring, check stroke draws on).
 *   - FIT GATE: when the label is wider than the space the card can offer,
 *     it defaults to a plain static truncated label; a while in it makes
 *     one slow roll of the full text, then pushes out while the generic
 *     "Working" slides in, rests, and the cycle reverses (SlideCycleLabel).
 *   - Live texts shimmer; nothing is ever "ADHD" — slow, regular, mostly
 *     still. prefers-reduced-motion disables all of it (CSS + JS).
 */

/** Production status icon size: size-4 = 16px (matches the card's icon). */
const CHROME_ICON_W = 16;
/** Fit-gate: the slide window never gets narrower than this. */
const SLIDE_MIN_W = 120;
/** Fit-gate: the slide window never gets narrower than this. */

const HIDDEN_SIZER_CLS = "pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0";

/**
 * The status icon as ONE persistent SVG so its shape can MORPH instead of
 * swapping or rolling:
 *   - ring: dashes (running) ↔ solid (done) — the dasharray animates, so
 *     the dashes stretch and merge into a full circle (and back)
 *   - check: stroke-dashoffset draw-on / draw-off, slightly after the ring
 *     settles
 * Idle life: a slow fade pulse. The one-shot springy spin on activity
 * change runs through the Web Animations API (no remount, so the morph
 * survives).
 */
export function ThreadActivityMorphIcon({
  solid,
  pulse = false,
  spinTick = 0,
  spin = false,
}: {
  solid: boolean;
  pulse?: boolean;
  spinTick?: number;
  spin?: boolean;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!spin || spinTick === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(378deg)", offset: 0.7 },
        { transform: "rotate(360deg)" },
      ],
      {
        duration: 600,
        delay: 1150, // after width glide (0.82s) + roll-in (1.10s) is done
        easing: "cubic-bezier(0.34, 1.4, 0.44, 1)",
      },
    );
  }, [spinTick, spin]);
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-4 shrink-0", pulse && "t3team-icon-pulse")}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        style={{
          strokeDasharray: solid ? "62.83 0.01" : "7 3.44",
          transition: "stroke-dasharray 0.5s ease",
        }}
      />
      <path
        d="M8.4 12.6l2.6 2.6 4.9-5.4"
        style={{
          strokeDasharray: 11.5,
          strokeDashoffset: solid ? 0 : 11.5,
          transition: "stroke-dashoffset 0.35s ease 0.15s",
        }}
      />
    </svg>
  );
}

/**
 * DYNAMIC WIDTH container: no reserved space. A hidden sizer measures the
 * FINAL layout (icon + label + timer, same gaps) and the container width
 * glides to it after the outgoing text has flipped away (0.42s delay).
 * The visible unit is in-flow (so the container has real height — an
 * absolute-only unit collapses to 0px and clips everything inside it);
 * the icon sits at the container's left edge and glides with the width,
 * the timer at the right edge, where it stays anchored. No overflow
 * clipping: the 3D roll needs to stay visible.
 */
function StatusWidth({
  id,
  label,
  duration,
  slideW,
  children,
}: {
  id: string;
  /** the incoming label text (for the sizer) */
  label: string;
  /** timer node, or undefined when this state shows no timer */
  duration?: ReactNode;
  /** slide mode: the label window width instead of the natural text width */
  slideW?: number | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-width-sizer]");
    if (el) setWidth(el.offsetWidth);
  }, [id, slideW, duration]);
  return (
    <span
      ref={ref}
      className="relative inline-block whitespace-nowrap transition-[width] duration-400 ease-in-out [transition-delay:0.42s]"
      style={width ? { width: `${width}px` } : undefined}
    >
      {/* hidden measurement copy of the final layout (same gaps) */}
      <span data-width-sizer aria-hidden className={HIDDEN_SIZER_CLS}>
        <span className="inline-flex items-center gap-1">
          <span style={{ width: CHROME_ICON_W, height: 16 }} />
          {slideW ? (
            <span style={{ width: slideW, height: 16 }} />
          ) : (
            <span className="font-medium">{label}</span>
          )}
          {duration ? (
            <span aria-hidden className="ml-0.5">
              {duration}
            </span>
          ) : null}
        </span>
      </span>
      {/* visible unit: icon left, label middle, timer right */}
      <span className="flex items-center gap-1">{children}</span>
    </span>
  );
}

/**
 * Slide-mode label (fit-gated, GHE #40): on first appearance the label
 * slides in from the left edge to its start position; then it scrolls
 * out to the left (the full text passes through the window, tail entering
 * from the right), pauses once fully out, and slides back in from the
 * left to the start — repeating. One element, one steady slow speed, no
 * text swap. The travel is the label's own width, so the window shows
 * text the whole way (never "disappears into nothing").
 */
const LOOP_PAUSE = 2000; // ms held fully out before sliding back
const LOOP_DWELL = 4000; // ms held at the start position before scrolling out
const LOOP_SPEED = 30; // px per second — the slow cadence
const ENTER_DURATION = 700; // ms for the first-appearance slide-in

function SlideCycleLabel({ text, slideW }: { text: string; slideW: number }) {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // natural width of the full label = the scroll-out distance
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [textW, setTextW] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = sizerRef.current;
    if (el) setTextW(el.offsetWidth);
  }, [text]);

  const labelRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  useEffect(() => {
    const el = labelRef.current;
    if (!el || reduced || slideW <= 0 || textW === undefined || textW <= 0) return;
    let loop: Animation | null = null;
    const startLoop = () => {
      const leg = Math.round(textW / LOOP_SPEED);
      const total = leg * 2 + LOOP_PAUSE + LOOP_DWELL;
      loop = el.animate(
        [
          { transform: "translateX(0px)", easing: "ease-in-out" },
          {
            transform: `translateX(${-textW}px)`,
            offset: leg / total,
            easing: "linear",
          },
          {
            transform: `translateX(${-textW}px)`,
            offset: (leg + LOOP_PAUSE) / total,
            easing: "ease-in-out",
          },
          {
            transform: "translateX(0px)",
            offset: (leg * 2 + LOOP_PAUSE) / total,
            easing: "linear",
          },
          { transform: "translateX(0px)" },
        ],
        { duration: total, iterations: Infinity },
      );
      animRef.current = loop;
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
      startLoop();
    };
    return () => {
      enter.onfinish = null;
      enter.cancel();
      loop?.cancel();
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

/**
 * Short-label roll: the outgoing label flips away, the incoming one flips
 * in (CSS choreography in index.css; out finishes before in starts).
 */
function RollLabel({ text, shimmer }: { text: string; shimmer: boolean }) {
  const prevRef = useRef(text);
  const [previous, setPrevious] = useState<string | undefined>(undefined);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (prevRef.current === text) return;
    const prev = prevRef.current;
    prevRef.current = text;
    setPrevious(prev);
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 1100); // out + in
    return () => window.clearTimeout(t);
  }, [text]);
  return (
    <span className="t3team-roll-stage relative block">
      {rolling && previous ? (
        <span
          aria-hidden
          key={previous}
          className="t3team-status-roll-out absolute inset-x-0 top-0"
        >
          <span className={shimmer ? "t3team-label-shimmer" : ""}>{previous}</span>
        </span>
      ) : null}
      <span
        key={text}
        role="status"
        className={cn(
          shimmer ? "t3team-label-shimmer" : "",
          rolling ? "t3team-status-roll-in" : "",
        )}
      >
        {text}
      </span>
    </span>
  );
}

export function ThreadActivityStatus({
  kind,
  label,
  timer,
  avail,
  spinTick = 0,
  className,
}: {
  kind: "live" | "done";
  /** text to show: live → the activity label (or generic "Working"), done → "Done" */
  label: string;
  /** duration timer node (live only) */
  timer?: ReactNode | null;
  /** space (px) the card row can offer the cluster; enables the fit gate */
  avail?: number | undefined;
  /** bump on every live→live label update to run the icon's one-shot spin */
  spinTick?: number;
  className?: string;
}) {
  // FIT GATE: compare the natural cluster width against the offered space.
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    if (kind !== "live" || avail === undefined) {
      setOver(false);
      return;
    }
    const sizer = sizerRef.current;
    if (!sizer) return;
    setOver(sizer.offsetWidth > avail);
  }, [kind, label, avail, timer !== null && timer !== undefined]);
  // FIT GATE → slide mode only when the label doesn't fit; the window is a
  // fixed width so the belt slides back and forth at one steady speed
  const slideW = over && avail !== undefined ? Math.max(avail, SLIDE_MIN_W) : undefined;

  const shimmer = kind === "live";

  return (
    <span className={cn("t3team-activity-scope inline-flex", className)}>
      {/* fit-gate measurement: natural width of icon + label + timer */}
      <span ref={sizerRef} aria-hidden className={HIDDEN_SIZER_CLS}>
        <span className="inline-flex items-center gap-1">
          <span style={{ width: CHROME_ICON_W, height: 16 }} />
          <span className="font-medium">{label}</span>
          {timer ? <span aria-hidden>{timer}</span> : null}
        </span>
      </span>
      <StatusWidth
        id={`${label}${slideW ? "|slide" : ""}`}
        label={label}
        duration={timer}
        slideW={slideW}
      >
        <span>
          <ThreadActivityMorphIcon
            solid={kind === "done"}
            pulse={kind === "live"}
            spin={kind === "live"}
            spinTick={spinTick}
          />
        </span>
        <span className="relative min-w-0 flex-1 font-medium">
          {slideW !== undefined ? (
            <SlideCycleLabel text={label} slideW={slideW} />
          ) : (
            <RollLabel text={label} shimmer={shimmer} />
          )}
        </span>
        {timer !== null && timer !== undefined ? (
          <span aria-hidden className="ml-0.5 shrink-0 opacity-70">
            {timer}
          </span>
        ) : null}
      </StatusWidth>
    </span>
  );
}
