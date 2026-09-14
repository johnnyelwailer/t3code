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
 *     it periodically slides out to the LEFT (the right end of the text
 *     docks at the window's right edge), stays there, and slides straight
 *     back in to the start — one
 *     element, one slow speed,
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
import type { CSSProperties, ReactNode } from "react";

import {
  DoneCard,
  SubRunRow,
  ThreadCard,
} from "~/t3team/stories/t3team-ActivityLabelVariants-motions";
import { StateCycleCard } from "~/t3team/stories/t3team-ActivityLabelVariants-stateCycle";

const LIVE_LABELS = ["Reading contracts", "Running checkout tests"];
const LONG_LABEL = "Running tests across the checkout matrix";

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
                caption="long label: static truncated, then it slides out to the left (right end docks at the window's right edge), stays there, and slides back to the start — repeating at one slow speed"
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
                note="the long label stays static + truncated, periodically slides out to the left (right end docking at the window's right edge), stays there, and slides back to the start — one element, one slow speed; short labels just roll; the icon never rolls, the timer stays anchored"
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
