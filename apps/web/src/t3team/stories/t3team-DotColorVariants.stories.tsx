import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import type { CSSProperties } from "react";

import "./t3team-DotColorVariants.css";
import "./t3team-DotColorVariantsCD.css";

/**
 * "Living status dots" polish — four directions for SMOOTH, theme-oriented
 * dot color shifts (PJ: "i dont like the colors changing in an instant…
 * subtle color shift animations, and a theme-oriented color palette…
 * more polished"). May land with 0.0.39.
 *
 * STORY-ONLY — no production behavior change. Every variant paints the
 * EXACT production dot DOM (`.t3team-aci-cell[data-t3team-state]` wrapping
 * the pulse span + `.t3team-aci-dot`, the same structure the working row and
 * Agents panel stamp), so:
 *   - the shared state keyframes (wave / snap / breathe / ring) run from
 *     t3team-index.css unchanged — motion carries the state;
 *   - the dots inherit the production centering (the GHE #201 alignment
 *     test's dx=dy=0 geometry) — variants change ONLY paint;
 *   - `prefers-reduced-motion` stills everything (media query in the
 *     variant CSS + the production block).
 *
 * The production gap these variants demonstrate: today the indicator
 * RE-MOUNTS the cell on state change (the .t3team-aci-shift keyed remount),
 * so the declared `background 0.9s` transition never fires and the color
 * snaps. Here the cells are persistent and only `data-t3team-state` flips,
 * which is what makes the crossfade visible. Productizing a direction =
 * moving its palette + transition into the shared CSS and keeping the
 * cell mounted across state changes (or accepting the one-shot shift as the
 * transition's trigger).
 *
 * 8 states per variant: thinking · writing · working · waiting · settled ·
 * done · error · base (no state stamped — the resting dot).
 */

/** The full dot vocabulary: the five live states + the two roster result
 *  states (t3team-agentsPanelDots.logic) + the unstamped base dot. */
const STATES: readonly (string | null)[] = [
  "thinking",
  "writing",
  "working",
  "waiting",
  "settled",
  "done",
  "error",
  null,
];

const STATE_LABELS: Record<string, string> = {
  thinking: "thinking",
  writing: "writing",
  working: "working",
  waiting: "waiting",
  settled: "settled",
  done: "done",
  error: "error",
  base: "base (no state)",
};

/** One dot — identical DOM to AgentsPanelStatusDot / the working-row cell. */
function Dot({
  state,
  index,
  className,
}: {
  state: string | null;
  index: number;
  className?: string;
}) {
  const cellStyle = { "--t3team-aci-i": index } as CSSProperties;
  return (
    <span
      className={`t3team-aci-cell inline-flex items-center justify-center${className ? ` ${className}` : ""}`}
      data-t3team-state={state ?? undefined}
      style={cellStyle}
      aria-hidden
    >
      <span className="relative inline-flex">
        <span className="t3team-aci-dot" />
      </span>
    </span>
  );
}

/** Static 8-state row — the "alignment-test story layout": one dot per state,
 *  state name underneath. */
function StateRow({ scope }: { scope: string }) {
  return (
    <div className="sdv2-row">
      {STATES.map((state, i) => (
        <div key={state ?? "base"} className="sdv2-col">
          <Dot state={state} index={i} className={scope} />
          <span className="sdv2-state-label">{STATE_LABELS[state ?? "base"]}</span>
        </div>
      ))}
    </div>
  );
}

/** Live flip demo: three persistent dots cycling working → thinking → waiting
 *  (≈2.4s per step) so the color crossfade between states is visible. */
function FlipDemo({ scope, autoCycle }: { scope: string; autoCycle: boolean }) {
  const PHASES: readonly string[] = ["working", "thinking", "waiting"];
  const [phase, setPhase] = useState(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    if (!autoCycle) return;
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % 3), 2400);
    return () => window.clearInterval(timer);
  }, [autoCycle]);

  const states = PHASES.map((_, i) => PHASES[(phase + i) % 3] ?? "working");

  return (
    <div className="sdv2-row" data-sdv2-flip={scope}>
      {states.map((state, i) => (
        <div key={i} className="sdv2-col">
          <Dot state={state} index={i + 4} className={scope} />
          <span className="sdv2-state-label">{state}</span>
        </div>
      ))}
    </div>
  );
}

function VariantCard({
  scope,
  letter,
  name,
  technique,
  paletteNote,
  children,
  alsoInherits = "",
}: {
  scope: string;
  letter: string;
  name: string;
  technique: string;
  paletteNote: string;
  children: React.ReactNode;
  /** Extra scope class(es) this card inherits paint from (B inherits A). */
  alsoInherits?: string;
}) {
  return (
    <div
      className={`w-[620px] rounded-xl border border-border/70 bg-card p-4 shadow-sm ${alsoInherits} ${scope}`}
    >
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-xs font-semibold text-foreground">{`${letter}. ${name}`}</span>
        <span className="text-[10px] text-muted-foreground/80">{technique}</span>
      </div>
      <div className="mb-2 text-[10px] leading-relaxed text-muted-foreground">{paletteNote}</div>
      {children}
    </div>
  );
}

type DotColorVariantsProps = {
  /** Cycle the flip-demo rows (working → thinking → waiting) to show the
   *  color crossfade. Off = fully static canvas for screenshots. */
  autoCycle: boolean;
  /** Force the reduced-motion look on a normal machine. */
  reducedMotion: boolean;
  /** Render just one variant's card ("all" = the full comparison). */
  focus: "all" | "A" | "B" | "C" | "D";
  /** Uniform zoom on the visible card(s) — the dots are 4px; 2–3x reads best. */
  zoom: number;
};

type VariantConfig = {
  id: "A" | "B" | "C" | "D";
  scope: string;
  alsoInherits?: string;
  letter: string;
  name: string;
  technique: string;
  paletteNote: string;
};

const VARIANTS: readonly VariantConfig[] = [
  {
    id: "A",
    scope: "sdv2-vA",
    letter: "A",
    name: "Smooth crossfade",
    technique: "persistent cells · 380ms ease-in-out on background-color / box-shadow / opacity",
    paletteNote:
      "Theme-token palette (color-mix in oklch): working = --primary (theme accent) · thinking = --warning tinted into --muted-foreground · writing = softened --primary · waiting/settled = muted neutral · done = --success · error = --destructive. Dark set lifts each toward white ~15%.",
  },
  {
    id: "B",
    scope: "sdv2-vB",
    alsoInherits: "sdv2-vA",
    letter: "B",
    name: "Soft-glow blend",
    technique:
      "A's palette + two-layer halo (tight 6px + wide 16px) blending on the same 380ms ease-in-out; ring border crossfades too",
    paletteNote:
      "Same tokens as A — the difference is the light: two stacked glows whose COLOR transitions with the core, so a state change reads as the halo breathing into the new hue. No geometry change.",
  },
  {
    id: "C",
    scope: "sdv2-vC",
    letter: "C",
    name: "Hue-drift subtle",
    technique: "one quiet oklch family (hue 235–290°, chroma ≤ 0.11) · 500ms ease-in-out · no halo",
    paletteNote:
      "Live states live within ~55° of each other at low chroma, so working→thinking reads as a gentle drift, not a flip — the existing motion + hue wander carries the state. done/error stay color-coded but desaturated. Lightness tuned per theme.",
  },
  {
    id: "D",
    scope: "sdv2-vD",
    letter: "D",
    name: "Porcelain orb (recommended)",
    technique:
      "420ms soft-out color morph on everything · drifting orb sheen (position + opacity + color) · very subtle 4px halo · waiting = soft breathing halo (no hard ring)",
    paletteNote:
      "Accent-anchored tokens, chroma nudged up slightly. The sheen is a blurred color-mix(state, white) highlight that slowly drifts position and opacity while its color follows the state transition - the dot behaves like a lit orb. The waiting state's old hard ring is gone (soft halo instead, no layout impact) and the flip-demo labels reserve width so state changes never reflow the row.",
  },
];

function DotColorVariants({ autoCycle, reducedMotion, focus, zoom }: DotColorVariantsProps) {
  return (
    <div className="flex w-full flex-col items-center gap-6 px-10 py-10 pb-16">
      {reducedMotion ? (
        <style>{`[class*="sdv2-v"] .t3team-aci-cell, [class*="sdv2-v"] .t3team-aci-cell > span::before, [class*="sdv2-v"] .t3team-aci-dot { animation: none !important; transition: none !important; box-shadow: none !important; opacity: 0.55 !important; }`}</style>
      ) : null}

      <div style={{ zoom }}>
        {VARIANTS.filter((variant) => focus === "all" || variant.id === focus).map((variant) => (
          <VariantCard
            key={variant.id}
            scope={variant.scope}
            {...(variant.alsoInherits !== undefined ? { alsoInherits: variant.alsoInherits } : {})}
            letter={variant.letter}
            name={variant.name}
            technique={variant.technique}
            paletteNote={variant.paletteNote}
          >
            <StateRow scope={variant.scope} />
            <FlipDemo scope={variant.scope} autoCycle={autoCycle} />
          </VariantCard>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground/70">
        All four variants paint the production dot DOM — shared keyframes, the waiting ring, and the
        dead-center alignment from the GHE #201 alignment-test story are inherited untouched
        (variants change paint only).{" "}
        <code className="text-foreground/70">prefers-reduced-motion</code> stills every dot.
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Conversation/Status Dots — Color Shift Directions",
  component: DotColorVariants,
  args: {
    autoCycle: true,
    reducedMotion: false,
    focus: "all" as "all" | "A" | "B" | "C" | "D",
    zoom: 1,
  },
  argTypes: {
    focus: {
      control: "select",
      options: ["all", "A", "B", "C", "D"],
      description:
        "Render a single variant's card so it can be studied up close (D = the porcelain orb).",
    },
    zoom: {
      control: { type: "number", min: 0.5, max: 3, step: 0.25 },
      description: "Uniform zoom on the visible card(s). The dots are 4px — 2–3x reads best.",
    },
    autoCycle: {
      control: "boolean",
      description:
        "Cycle the flip-demo rows working → thinking → waiting every ~2.4s to show the color crossfade.",
    },
    reducedMotion: {
      control: "boolean",
      description: "Force the reduced-motion fallback (static dots, no halos).",
    },
  },
} satisfies Meta<typeof DotColorVariants>;

export default meta;
type Story = StoryObj<typeof DotColorVariants>;

export const Directions: Story = {
  name: "Four directions (A crossfade · B soft-glow · C hue-drift · D porcelain)",
  args: { autoCycle: true, reducedMotion: false, focus: "all", zoom: 1 },
};

export const PorcelainOrbFocus: Story = {
  name: "D only — porcelain orb (focus, zoomed)",
  args: { autoCycle: true, reducedMotion: false, focus: "D", zoom: 2.5 },
};

export const StaticForCapture: Story = {
  name: "Static (for screenshots)",
  args: { autoCycle: false, reducedMotion: false },
};

export const ReducedMotionStatic: Story = {
  name: "Reduced motion (static fallback)",
  args: { autoCycle: false, reducedMotion: true },
};
