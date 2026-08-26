/**
 * GHE-40 activity label — VARIANT A, motion design
 * (v2 thread card, src/components/Sidebar.tsx) — the left-nav surface.
 *
 * Placement was decided in the previous iterations: the live label REPLACES
 * "Working" in the right-side status slot (variant A). This story is about
 * the MOTION LANGUAGE, and it is LIVE — every card runs its own timers so
 * the behavior can be watched:
 *
 *   - DYNAMIC WIDTH: the status reserves no fixed space. The unit's width
 *     animates on EVERY status change, so the icon and the duration timer
 *     move (glide) to where the next status text needs to be
 *   - SHIMMER: all live status texts carry a slow highlight sweep
 *   - status icon: STATIC, with a simple slow fade pulse (opacity
 *     1 → 0.55 → 1, 3.2s). On activity change the icon does ONE quick
 *     springy 360° spin, then settles back
 *   - ONLY TEXT ROLLS. Never the icon. And the timing is choreographed
 *     with perceptible beats: 1) the outgoing label flips away and is
 *     fully gone (0.30s) → 2) a beat of stillness, then the width glide
 *     moves the icon into place (0.42–0.82s) → 3) the incoming label
 *     flips in as the move finishes (0.78s). The timer is anchored at
 *     the container's right edge: it never shifts or jumps when the new
 *     label's width lands
 *   - kind change (live → Waiting → Done): the text still rolls, and the
 *     icon MORPHS where it sits (dashed ring → solid ring, check stroke
 *     draws on/off) instead of swapping or rolling
 *   - FIT GATE: when a label is longer than the space the card can offer,
 *     it defaults to a plain STATIC, truncated label (ellipsis). It
 *     periodically slides out to the right edge of its window, pauses,
 *     and slides back to the start — one element, one slow speed,
 *     no text swap
 *     — the timer stays anchored the whole time
 *   - child rows: the label never flies in. Fits → docked to the right,
 *     static; doesn't fit → the title FLIPS to the status text
 *
 * The card + sub-run components are internal to Sidebar.tsx (not exported),
 * so their structure below is a faithful copy of the JSX/classes (inset CSS
 * vars set to the production values from src/index.css); every building
 * block inside is a real exported component: ProjectFavicon,
 * ProviderInstanceIcon, lucide.
 *
 * All keyframes live in t3team-storybook-canvas.css; if this ships, they
 * move with it into the app stylesheet. Everything respects
 * prefers-reduced-motion.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode, Ref, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleCheckIcon } from "lucide-react";

import { ThreadActivityStatus } from "~/components/ThreadActivityStatus";
import { cn } from "~/lib/utils";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";

import { EnvironmentId, ProviderDriverKind } from "@t3tools/contracts";

const LIVE_LABELS = ["Reading contracts", "Running checkout tests"];
const LONG_LABEL = "Running tests across the checkout matrix";
const THREAD_TITLE = "Fix settings crash";
const PROJECT_TITLE = "nexi-distribution";
const BRANCH = "fix/settings-crash";
const DURATION = "2m 34s";

/* production inset vars (src/index.css) so the verbatim inset classes work */
const INSET_VARS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

/* ── story chrome (clearly NOT the UI) ─────────────────────────────────── */

function RailLabel({
  keyLabel,
  caption,
  note,
}: {
  keyLabel: string;
  caption: string;
  note?: string;
}) {
  return (
    <div className="w-[150px] shrink-0 border-l border-dashed border-zinc-500/40 py-1 pl-3">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {keyLabel}
        </span>
        <span className="rounded-sm bg-emerald-500/10 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-emerald-400">
          decided
        </span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-zinc-400">{caption}</div>
      {note ? <div className="mt-1 text-[10px] leading-snug text-sky-400/80">{note}</div> : null}
    </div>
  );
}

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
const STATUS_ICON_W = 14; // size-3.5

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
    if (el) setWidth(el.offsetWidth);
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
            <span aria-hidden className="opacity-70">
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
function MorphIcon({
  solid,
  size = "md",
  pulse = false,
  spinTick = 0,
  spin = false,
}: {
  solid: boolean;
  size?: "md" | "sm";
  pulse?: boolean;
  spinTick?: number | undefined;
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
function useStatusAvail(cardRef: RefObject<HTMLDivElement | null>) {
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

function ProjectSizer({ refHost }: { refHost: Ref<HTMLSpanElement> }) {
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

/**
 * The long-label cycle (fit-gate slide mode). The label DEFAULTS to a
 * plain static, truncated label; a while in (not immediately) it starts
 * one slow roll showing the full text, then rolls into the generic
 * "Working", rests there, and rolls back into the label. Same roll
 * choreography as the short labels (no overlap: out finishes before in
 * starts). Under prefers-reduced-motion the roll is skipped entirely —
 * just the static truncated label.
 */
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
      const leg = Math.round(textW / 30); // px/s — the slow cadence
      const total = leg * 2 + 2000 + 4000;
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
            offset: (leg + 2000) / total,
            easing: "ease-in-out",
          },
          {
            transform: "translateX(0px)",
            offset: (leg * 2 + 2000) / total,
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
      { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
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

function ThreadCard({
  label = "Reading contracts",
  labels,
  slide = false,
  idle = false,
  showDuration = true,
}: {
  label?: string;
  labels?: string[];
  slide?: boolean;
  idle?: boolean;
  showDuration?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { avail, sizerRef } = useStatusAvail(cardRef);
  // FIT GATE: fixed slide window; the label simply slides out and back
  const slideWindow = Math.max(avail, 120);
  const cycles = !idle && !slide && !!labels && labels.length > 1;
  const [idx, setIdx] = useState(0);
  const [spinTick, setSpinTick] = useState(0);
  const lastIdxRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cycles) return;
    const t = window.setInterval(() => {
      setIdx((v) => {
        lastIdxRef.current = v;
        return (v + 1) % labels!.length;
      });
      setSpinTick((v) => v + 1);
    }, 14000);
    return () => window.clearInterval(t);
  }, [cycles, labels]);
  // the sizer must measure what is actually shown — the idle card displays
  // “Waiting”, not its label prop
  const activeLabel = idle ? "Waiting" : cycles ? (labels![idx] ?? label) : label;
  const lastIdx = lastIdxRef.current;
  const previousLabel = cycles && lastIdx !== null ? (labels![lastIdx] ?? undefined) : undefined;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className="group/sidebar-row t3team-label-pass-scope relative w-full cursor-pointer overflow-hidden rounded-md bg-sidebar-row-active text-sidebar-foreground outline-none select-none"
    >
      <ProjectSizer refHost={sizerRef} />
      <div className="relative z-10 px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        {/* header strip */}
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            className="size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-secondary-label text-xs font-medium">
            {PROJECT_TITLE}
          </span>
          {/* status slot — dynamic width, no reserved space: icon pinned
              left, timer pinned right, label fills the middle */}
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            <StatusWidth
              id={`${activeLabel}${slide ? "|slide" : ""}`}
              label={activeLabel}
              duration={showDuration ? DURATION : undefined}
              slideW={slide ? slideWindow || undefined : undefined}
            >
              {/* icon glides with the width transition; spins on each update */}
              <span className="shrink-0 text-sky-600 dark:text-sky-400">
                <MorphIcon solid={false} pulse spin={cycles} spinTick={spinTick} />
              </span>
              <span className="relative min-w-0 flex-1 font-medium text-sky-600 dark:text-sky-400">
                {idle ? (
                  <span role="status" className="opacity-60">
                    <span className="t3team-label-shimmer">Waiting</span>
                  </span>
                ) : slide ? (
                  /* FIT GATE: static truncated label by default; a while in
                     it slides out to the left, pauses, and slides
                     back — the timer stays anchored the whole time */
                  <SlideCycleLabel text={label} slideW={slideWindow} />
                ) : (
                  /* the label rolls; width glide happens on the container */
                  <span className="t3team-roll-stage relative block">
                    {cycles && previousLabel ? (
                      <span
                        aria-hidden
                        key={`out-${activeLabel}`}
                        className="t3team-status-roll-out absolute inset-x-0 top-0"
                      >
                        <span className="t3team-label-shimmer">{previousLabel}</span>
                      </span>
                    ) : null}
                    <span
                      key={activeLabel}
                      role="status"
                      className={`t3team-label-shimmer ${cycles ? "t3team-status-roll-in" : ""}`}
                    >
                      {activeLabel}
                    </span>
                  </span>
                )}
              </span>
              {showDuration ? (
                /* anchored at the container's right edge — it never shifts
                   when the incoming label's width lands; dimmed with the
                   text while waiting */
                <span aria-hidden className={cn("shrink-0", idle ? "opacity-50" : "opacity-70")}>
                  {DURATION}
                </span>
              ) : null}
            </StatusWidth>
          </span>
        </div>

        {/* title row */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
            {THREAD_TITLE}
          </span>
        </div>

        {/* meta strip: branch + provider icon */}
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">{BRANCH}</span>
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make("claudeAgent")}
            displayName="Nexplore"
            className="size-3.5"
            iconClassName="size-3.5"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Faithful copy of SidebarSubRunRow (Sidebar.tsx ~line 1825): one-line child
 * row rendered directly below its parent's card. The running child uses the
 * SAME static dashed-circle icon with its shimmer ring. The activity label
 * never animates on child rows: fits → it docks to the right, static;
 * doesn't fit → the title FLIPS to the status text. Live labels shimmer.
 */
function SubRunRow({
  title,
  state,
  time,
  dockLabel,
  flipLabel,
}: {
  title: string;
  state: "running" | "completed";
  time: string;
  dockLabel?: string;
  flipLabel?: string;
}) {
  return (
    <li role="presentation" className="list-none">
      <button
        type="button"
        className="flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md pe-2.5 ps-[calc(var(--sidebar-content-inset)+1rem)] text-left text-xs outline-none text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
      >
        {state === "running" ? (
          <span className="shrink-0 text-sky-600 dark:text-sky-400">
            <MorphIcon solid={false} size="sm" pulse />
          </span>
        ) : (
          <CircleCheckIcon
            aria-hidden
            className="size-3 shrink-0 text-sidebar-muted-foreground/70"
          />
        )}
        {flipLabel ? (
          /* title flips to the status text (roll in production) */
          <span
            className="min-w-0 flex-1 truncate font-medium text-sky-600 dark:text-sky-400"
            title={title}
          >
            <span className="t3team-label-shimmer">{flipLabel}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{title}</span>
        )}
        {dockLabel ? (
          /* fits → docked to the right, static, no overlap */
          <span className="shrink-0 font-medium text-sky-600 dark:text-sky-400" title={title}>
            <span className="t3team-label-shimmer">{dockLabel}</span>
          </span>
        ) : null}
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground/55 tabular-nums">
          {time}
        </span>
      </button>
    </li>
  );
}

/** Settled "Done" card — context row, production structure. */
function DoneCard() {
  return (
    <div
      role="button"
      tabIndex={0}
      className="group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md bg-transparent text-sidebar-foreground outline-none select-none hover:bg-sidebar-row-hover"
    >
      <div className="relative z-10 px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            className="size-4 shrink-0 opacity-40 grayscale"
          />
          <span className="min-w-0 flex-1 truncate text-secondary-label text-xs font-normal">
            {PROJECT_TITLE}
          </span>
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
              <CircleCheckIcon aria-hidden className="size-4 shrink-0" />
              <span role="status">Done</span>
            </span>
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-normal text-secondary-label">
            Update release notes
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">docs/release-notes</span>
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make("claudeAgent")}
            displayName="Nexplore"
            className="size-3.5"
            iconClassName="size-3.5"
          />
        </div>
      </div>
    </div>
  );
}

/* ── the live state machine: every transition, in action ───────────────── */

const DEMO_STATES = [
  { key: "live1", kind: "live", text: "Reading tests" },
  { key: "live2", kind: "live", text: "Running the full checkout matrix across worktrees" },
  { key: "idle", kind: "idle", text: "Waiting" },
  { key: "done", kind: "done", text: "Done" },
] as const;

type DemoState = (typeof DEMO_STATES)[number];

/** Card that cycles live → live → Waiting → Done on its own timer. */
function StateCycleCard() {
  const [i, setI] = useState(0);
  const [spins, setSpins] = useState(0);
  const [measure, setMeasure] = useState<{ avail: number; labelW: Record<string, number> } | null>(
    null,
  );
  const lastRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sizersRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setI((v) => {
        lastRef.current = v;
        return (v + 1) % DEMO_STATES.length;
      });
      setSpins((v) => v + 1);
      const next = DEMO_STATES[(lastRef.current! + 1) % DEMO_STATES.length];
      // the long label stays long enough to show its full cycle
      t = window.setTimeout(tick, next?.key === "live2" ? 47000 : 6000);
    };
    t = window.setTimeout(tick, 6000);
    return () => window.clearTimeout(t);
  }, []);
  const state = DEMO_STATES[i] ?? (DEMO_STATES[0] as DemoState);
  const last = lastRef.current;
  const previous = last === null ? null : (DEMO_STATES[last] ?? null);
  /* FIT GATE: the demo states are static, so every natural width is measured
     ONCE at mount (hidden sizers, same font context as the status) and the
     gate is a pure comparison at render time:
     label + icon + gaps + timer (≈58px) vs. the space left of the card
     (card width − row insets − favicon − gap − project title). When the
     label is wider than the space, the card switches to slide-pass mode. */
  useLayoutEffect(() => {
    const card = cardRef.current;
    const sizers = sizersRef.current;
    if (!card || !sizers) return;
    const cr = card.getBoundingClientRect();
    const contentW = cr.width - 20; // row content inset, both sides
    const project = sizers.querySelector<HTMLElement>('[data-sizer="__project"]');
    const avail = contentW - 16 - 6 - (project ? project.offsetWidth : 0);
    const labelW: Record<string, number> = {};
    for (const s of DEMO_STATES) {
      const el = sizers.querySelector<HTMLElement>(`[data-sizer="${s.key}"]`);
      labelW[s.key] = el ? el.offsetWidth : 0;
    }
    setMeasure({ avail, labelW });
  }, []);
  const over = measure ? (measure.labelW[state.key] ?? 0) + 58 > measure.avail : false;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className="group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md bg-sidebar-row-active text-sidebar-foreground outline-none select-none"
    >
      <div className="relative z-10 px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            className="size-4 shrink-0"
          />
          <span
            data-project-title
            className="min-w-0 flex-1 truncate text-secondary-label text-xs font-medium"
          >
            {PROJECT_TITLE}
          </span>
          {/* status slot — dynamic width; the unit glides on every change;
              id carries the over-flag so StatusWidth re-measures when the
              fit gate flips the label into/out of slide mode */}
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            <StatusWidth
              id={state.key + (over ? "|slide" : "")}
              label={state.text}
              duration={state.kind === "live" || state.kind === "idle" ? DURATION : undefined}
              slideW={
                over && state.kind === "live"
                  ? Math.max(measure?.avail ?? 0, 120) || undefined
                  : undefined
              }
            >
              {/* the unit itself never remounts and never rolls: the text
                  rolls inside the middle slot, the icon morphs where it
                  sits and glides with the width transition, and the timer
                  stays anchored at the right edge */}
              <span
                className={`shrink-0 transition-colors duration-300 ${
                  state.kind === "done"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-sky-600 dark:text-sky-400"
                } ${state.kind === "idle" ? "opacity-60" : ""}`}
              >
                <MorphIcon
                  solid={state.kind === "done"}
                  pulse={state.kind !== "done"}
                  spinTick={previous?.kind === "live" && state.kind === "live" ? spins : 0}
                  spin={previous?.kind === "live" && state.kind === "live"}
                />
              </span>
              <span
                className={`relative min-w-0 flex-1 font-medium transition-colors duration-300 ${
                  state.kind === "done"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-sky-600 dark:text-sky-400"
                } ${state.kind === "idle" ? "opacity-60" : ""}`}
              >
                {over && state.kind === "live" ? (
                  /* FIT GATE: static truncated label by default; a while in
                     it slides out to the left, pauses, and slides back.
                     live2 stays long enough to show a full cycle. */
                  <SlideCycleLabel
                    text={state.text}
                    slideW={Math.max(measure?.avail ?? 0, 120) || 120}
                  />
                ) : (
                  <span className="t3team-roll-stage relative block">
                    {previous ? (
                      <span
                        aria-hidden
                        key={`out-${state.key}`}
                        className="t3team-status-roll-out absolute inset-x-0 top-0"
                      >
                        <span className={previous.kind !== "done" ? "t3team-label-shimmer" : ""}>
                          {previous.text}
                        </span>
                      </span>
                    ) : null}
                    <span
                      key={state.key}
                      role="status"
                      className={`t3team-label-shimmer ${previous ? "t3team-status-roll-in" : ""}`}
                    >
                      {state.text}
                    </span>
                  </span>
                )}
              </span>
              {state.kind === "live" || state.kind === "idle" ? (
                <span
                  aria-hidden
                  className={`shrink-0 ${
                    state.kind === "idle" ? "opacity-50" : "opacity-70"
                  } ${previous?.kind !== "live" ? "t3team-icon-fade-in" : ""}`}
                >
                  {DURATION}
                </span>
              ) : null}
            </StatusWidth>
          </span>
        </div>
        {/* hidden sizers for the fit gate (same font context as the status) */}
        <span
          ref={sizersRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
        >
          <span
            data-sizer="__project"
            className="inline-block whitespace-nowrap text-xs font-medium"
          >
            {PROJECT_TITLE}
          </span>
          {DEMO_STATES.map((s) => (
            <span
              key={s.key}
              data-sizer={s.key}
              className="inline-block whitespace-nowrap text-xs font-medium"
            >
              {s.text}
            </span>
          ))}
        </span>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
            Refactor settings panel
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">refactor/settings</span>
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make("claudeAgent")}
            displayName="Nexplore"
            className="size-3.5"
            iconClassName="size-3.5"
          />
        </div>
      </div>
    </div>
  );
}

/* ── story ──────────────────────────────────────────────────────────────── */

export default {
  title: "T3Team/Sidebar/Activity Label (GHE-40)",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

const DIVIDER = <div className="h-px bg-zinc-200/70 dark:bg-zinc-700/50" />;

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 px-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">▸</span>
      <span className="text-xs font-medium text-zinc-300">{children}</span>
    </div>
  );
}

export const PlacementVariants: Story = {
  render: () => (
    <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
      <div className="flex w-[500px] flex-col gap-5 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div>
          <SectionTitle>Thread card + child rows — v2 left nav, active thread</SectionTitle>
          <div style={INSET_VARS} className="flex flex-col gap-2 rounded-lg bg-sidebar p-1.5">
            <div className="flex items-center">
              <div className="min-w-0 flex-1">
                <ThreadCard labels={LIVE_LABELS} />
                {/* sub-run child rows, as rendered under the parent card */}
                <SubRunRow
                  title="Fix auth regression"
                  state="running"
                  time="now"
                  dockLabel="Fixing redirect"
                />
                <SubRunRow
                  title="Write release notes draft"
                  state="running"
                  time="1m"
                  flipLabel="Reviewing checkout matrix diffs"
                />
                <SubRunRow title="Sync project template" state="completed" time="1h" />
              </div>
              <RailLabel
                keyLabel="A"
                caption="live label in the status slot, replacing “Working”; child rows underneath"
                note="on each update: old label rolls away, new one rolls in (never overlapping), width glides so icon + timer move with it, icon spins once"
              />
            </div>
            <div className="flex items-center">
              <div className="min-w-0 flex-1">
                <ThreadCard label={LONG_LABEL} slide />
              </div>
              <RailLabel
                keyLabel="A+"
                caption="long label: static truncated, then slides out to the right edge, pauses, slides back to the start — repeating at one slow speed"
              />
            </div>
            <div className="flex items-center">
              <div className="min-w-0 flex-1">
                <ThreadCard idle />
              </div>
              <RailLabel
                keyLabel="A·idle"
                caption="no new activity for a while → dimmed “Waiting”, shimmer keeps it alive"
              />
            </div>
            <div className="flex items-center">
              <div className="min-w-0 flex-1">
                <DoneCard />
              </div>
              <RailLabel
                keyLabel="A·done"
                caption="settled → label clears, “Done” rolls in (context row)"
              />
            </div>
          </div>
        </div>

        {DIVIDER}

        <div>
          <SectionTitle>Every state change has motion — no pops</SectionTitle>
          <div style={INSET_VARS} className="flex flex-col gap-2 rounded-lg bg-sidebar p-1.5">
            <div className="flex items-center">
              <div className="min-w-0 flex-1">
                <StateCycleCard />
              </div>
              <RailLabel
                keyLabel="S"
                caption="state machine, cycled live: short label → LONG label → Waiting → Done → …"
                note="the long label stays static + truncated, periodically slides out to the right edge of its window, pauses, and slides back to the start — one element, one slow speed; short labels just roll; the icon never rolls, the timer stays anchored"
              />
            </div>
          </div>
        </div>

        <div className="px-1 pb-1 text-[11px] leading-relaxed text-zinc-500">
          Dashed rail = story annotation, not part of the UI. All motion respects{" "}
          <code className="font-mono">prefers-reduced-motion</code>.
        </div>
      </div>
    </div>
  ),
};

/*
 * ── production component ─────────────────────────────────────────────────
 * The real, shipping component: `ThreadActivityStatus`
 * (src/components/ThreadActivityStatus.tsx, used by src/components/Sidebar.tsx).
 * These frames mirror the production card row layout exactly (same insets,
 * favicon, title sizer + fit-gate math) so what you see here is what the
 * app renders.
 */

function ProdFrame({
  title,
  children,
}: {
  title: string;
  /** receives the frame's measured available width (same as the real card row) */
  children: (avail: number | undefined) => ReactNode;
}) {
  // same fit-gate math as Sidebar.tsx: row width − insets(20) − favicon(16)
  // − gap(6) − title natural width
  const rowRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [avail, setAvail] = useState<number | undefined>(undefined);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const t = sizerRef.current?.querySelector<HTMLElement>("[data-t]");
      const w = row.getBoundingClientRect().width;
      setAvail(Math.max(0, Math.floor(w) - 20 - 16 - 6 - (t ? t.offsetWidth : 0)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [title]);
  return (
    <div
      ref={rowRef}
      data-testid="prod-row-card"
      className="rounded-lg border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900"
    >
      <div className="relative h-[4.875rem] px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        <span
          ref={sizerRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
        >
          <span data-t className="inline-block whitespace-nowrap text-xs font-medium">
            {title}
          </span>
        </span>
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            className="size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-secondary-label text-xs font-medium">
            {title}
          </span>
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            {children(avail)}
          </span>
        </div>
      </div>
    </div>
  );
}

const PROD_TITLES = {
  short: "Refactor settings panel",
  long: "Refactor settings panel into a tabbed layout with a live preview pane",
};

function ProdLiveDemo() {
  const LABELS = ["Reading tests", "Compiling workers", "Fixing the test matrix"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((v) => (v + 1) % LABELS.length), 14000);
    return () => window.clearInterval(t);
  }, []);
  const label = LABELS[i] ?? "";
  const [spin, setSpin] = useState(0);
  const last = useRef(label);
  useEffect(() => {
    if (last.current !== label) {
      last.current = label;
      setSpin((s) => s + 1);
    }
  }, [label]);
  return (
    <ProdFrame title={PROD_TITLES.short}>
      {(avail) => (
        <ThreadActivityStatus
          kind="live"
          label={label}
          timer={<span className="font-mono tabular-nums">4m 12s</span>}
          avail={avail}
          spinTick={spin}
          className="text-sky-600 dark:text-sky-400"
        />
      )}
    </ProdFrame>
  );
}

function ProdKindDemo() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setDone((v) => !v), 7000);
    return () => window.clearInterval(t);
  }, []);
  return done ? (
    <ProdFrame title={PROD_TITLES.short}>
      {() => (
        <ThreadActivityStatus
          kind="done"
          label="Done"
          className="text-emerald-700 dark:text-emerald-300"
        />
      )}
    </ProdFrame>
  ) : (
    <ProdFrame title={PROD_TITLES.short}>
      {(avail) => (
        <ThreadActivityStatus
          kind="live"
          label="All tests green"
          timer={<span className="font-mono tabular-nums">12m 04s</span>}
          avail={avail}
          className="text-sky-600 dark:text-sky-400"
        />
      )}
    </ProdFrame>
  );
}

function ProdFitGateDemo() {
  return (
    <ProdFrame title={PROD_TITLES.long}>
      {(avail) => (
        <ThreadActivityStatus
          kind="live"
          label="Running the full checkout matrix across worktrees"
          timer={<span className="font-mono tabular-nums">1h 02m</span>}
          avail={avail}
          className="text-sky-600 dark:text-sky-400"
        />
      )}
    </ProdFrame>
  );
}

export const ProductionComponent: Story = {
  name: "Production component (ships in the app)",
  render: () => (
    <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
      <div className="flex w-[500px] flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <SectionTitle>
            Real <code className="font-mono">ThreadActivityStatus</code> — live label, rolls on
            update every 14s (icon spins, width glides, timer anchored)
          </SectionTitle>
          <ProdLiveDemo />
        </div>
        {DIVIDER}
        <div className="space-y-1.5">
          <SectionTitle>
            working ⇄ done: the icon morphs, the text rolls (toggles every 7s)
          </SectionTitle>
          <ProdKindDemo />
        </div>
        {DIVIDER}
        <div className="space-y-1.5">
          <SectionTitle>
            fit gate: label wider than the space → static truncated, then it slides out to the right
            edge, pauses, and slides back (loop ≈ 29s)
          </SectionTitle>
          <ProdFitGateDemo />
        </div>
      </div>
    </div>
  ),
};
