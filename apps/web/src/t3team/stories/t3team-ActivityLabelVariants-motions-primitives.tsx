/**
 * GHE-40 activity label — story support: motion primitives (dynamic-width
 * container, morph icon, fit-gate avail helper, project sizer) + the shared
 * label constants.
 *
 * Split from t3team-ActivityLabelVariants-motions.tsx (LOC ceiling).
 */
import type { ReactNode, Ref, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const THREAD_TITLE = "Fix settings crash";
export const PROJECT_TITLE = "nexi-distribution";
export const BRANCH = "fix/settings-crash";
export const DURATION = "2m 34s";

/* ── motion primitives ─────────────────────────────────────────────────── */

/**
 * DYNAMIC WIDTH container: no reserved space. A hidden sizer measures the
 * FINAL layout (icon + label + timer, same gaps) and the container width
 * glides to it after the outgoing text has flipped away (0.42s delay).
 * The visible unit is pinned inside: icon at the container's LEFT edge
 * (it glides with the width), timer at the RIGHT edge (anchored — it
 * never jumps when the new label's width hits the flow). No overflow
 * clipping on the container: the 3D roll needs to stay visible.
 */
const STATUS_ICON_W = 16; // size-4 (the MorphIcon's real width)

export function StatusWidth({
  id,
  label,
  duration,
  slideW,
  children,
}: {
  id: string;
  /** the incoming label text (for the sizer) */
  label: string;
  /** timer text, or undefined when this state shows no timer */
  duration?: string | undefined;
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
      <span
        data-width-sizer
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
      >
        <span className="inline-flex items-center gap-1">
          <span style={{ width: STATUS_ICON_W, height: 16 }} />
          {slideW ? (
            <span style={{ width: slideW, height: 16 }} />
          ) : (
            <span className="font-medium leading-4">{label}</span>
          )}
          {duration ? (
            <span aria-hidden className="ml-1 opacity-70">
              {duration}
            </span>
          ) : null}
        </span>
      </span>
      {/* visible unit: in-flow so the container has real height (an
          absolute-only unit collapses to 0px and clips everything inside
          it). Icon pinned at the container's left edge, timer at the
          right, label fills the middle. */}
      <span className="flex items-center gap-1">{children}</span>
    </span>
  );
}

/**
 * The status icon as ONE persistent SVG so its shape can MORPH instead of
 * swapping or rolling:
 *   - ring: dashes (running) ↔ solid (done) — the dasharray animates, so
 *     the dashes stretch and merge into a full circle (and back)
 *   - check: stroke-dashoffset draw-on / draw-off, slightly after the ring
 *     settles
 * Idle life: a slow fade pulse (t3team-icon-pulse). The one-shot springy
 * spin on activity change runs through the Web Animations API (no remount,
 * so the morph survives), starting after the icon has slid into place.
 */
export function MorphIcon({
  solid,
  size = "md",
  pulse = false,
  spinTick = 0,
  spin = false,
  instant = false,
}: {
  solid: boolean;
  size?: "md" | "sm";
  pulse?: boolean;
  spinTick?: number | undefined;
  spin?: boolean;
  /** true = spin now (label just landed); false = wait for the move to finish */
  instant?: boolean;
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
        delay: instant ? 0 : 1150, // delayed: after width glide (0.82s) + roll-in (1.10s)
        easing: "cubic-bezier(0.34, 1.4, 0.44, 1)",
      },
    );
  }, [spinTick, spin, instant]);
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`${size === "md" ? "size-4" : "size-3"} shrink-0 ${pulse ? "t3team-icon-pulse" : ""}`}
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

/* ── v2 thread card + sub-run rows ─────────────────────────────────────── */

/**
 * The status slot content for variant A:
 * shimmer-ring icon + (rolling) live label + duration timer, wrapped in a
 * dynamic-width container. Each update is orchestrated: the old label rolls
 * fully away, the new one rolls in, the unit width glides (icon + timer
 * move with it), and the icon does its quick one-time spin.
 */
/**
 * FIT GATE shared helper: measures, once, the space the card can offer the
 * status slot: card width − row insets − favicon − gap − the project title
 * at its NATURAL width (hidden sizer, same font context). In slide-pass
 * mode the label gets max(avail, 120) — at least 120px so a ticker of
 * text is actually readable; the project title truncates to make room.
 */
export function useStatusAvail(cardRef: RefObject<HTMLDivElement | null>) {
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [avail, setAvail] = useState(0);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const sizer = sizerRef.current;
    if (!card || !sizer) return;
    const cr = card.getBoundingClientRect();
    const project = sizer.querySelector<HTMLElement>('[data-sizer="__project"]');
    setAvail(Math.max(0, Math.floor(cr.width) - 20 - 16 - 6 - (project ? project.offsetWidth : 0)));
  }, [cardRef]);
  return { avail, sizerRef };
}

export function ProjectSizer({ refHost }: { refHost: Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={refHost}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
    >
      <span data-sizer="__project" className="inline-block whitespace-nowrap text-xs font-medium">
        {PROJECT_TITLE}
      </span>
    </span>
  );
}
