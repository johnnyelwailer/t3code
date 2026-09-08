import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import {
  CHROME_ICON_W,
  HIDDEN_SIZER_CLS,
  SLIDE_MIN_W,
} from "~/components/t3team-ThreadActivityStatus-shared";
import { SlideCycleLabel } from "~/components/t3team-ThreadActivityStatus-slideLabel";
import { ThreadActivityMorphIcon } from "~/components/t3team-ThreadActivityStatus-morphIcon";
import { RollLabel } from "~/components/t3team-ThreadActivityStatus-rollLabel";

export { ThreadActivityMorphIcon } from "~/components/t3team-ThreadActivityStatus-morphIcon";

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
/** Fit-gate: the slide window never gets narrower than this. */
/** Fit-gate: the slide window never gets narrower than this. */

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
    if (el) setWidth(el.getBoundingClientRect().width);
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
            <span aria-hidden className="ml-1">
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
  // spin trigger state: label changes spin after the move (delayed),
  // slide landings spin immediately
  const [spinState, setSpinState] = useState({ tick: 0, instant: false });
  useEffect(() => {
    if (spinTick > 0) setSpinState((s) => ({ tick: s.tick + 1, instant: false }));
  }, [spinTick]);
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
          {timer ? (
            <span aria-hidden className="ml-1">
              {timer}
            </span>
          ) : null}
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
            spinTick={spinState.tick}
            instant={spinState.instant}
          />
        </span>
        <span className="relative min-w-0 flex-1 font-medium">
          {slideW !== undefined ? (
            <SlideCycleLabel
              text={label}
              slideW={slideW}
              onLand={() => setSpinState((s) => ({ tick: s.tick + 1, instant: true }))}
            />
          ) : (
            <RollLabel text={label} shimmer={shimmer} />
          )}
        </span>
        {timer !== null && timer !== undefined ? (
          <span aria-hidden className="ml-1 shrink-0 opacity-70">
            {timer}
          </span>
        ) : null}
      </StatusWidth>
    </span>
  );
}
