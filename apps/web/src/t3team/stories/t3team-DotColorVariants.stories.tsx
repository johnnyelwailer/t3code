import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import type { CSSProperties } from "react";

import "~/t3team/t3team-statusOrb.css";

import "./t3team-DotColorVariants.css";
import "./t3team-DotColorVariantsCD.css";

/**
 * "Living status dots" polish — four directions for SMOOTH, theme-oriented
 * dot color shifts (PJ: "i dont like the colors changing in an instant…
 * subtle color shift animations, and a theme-oriented color palette…
 * more polished"). May land with 0.0.39.
 *
 * A/B/C are STORY-ONLY explorations that paint the EXACT production dot DOM
 * (`.t3team-aci-cell[data-t3team-state]` wrapping the pulse span +
 * `.t3team-aci-dot`, the same structure the working row and Agents panel
 * stamp) with their own scoped palettes. D — the porcelain orb, the chosen
 * direction — is PRODUCTION: its card stamps `t3team-orb` and the paint +
 * color-shift logic live in the shared production module
 * t3team-statusOrb.css (imported above), so this card shows the shipping
 * paint, not a copy. The state keyframes (wave / snap / breathe / ring)
 * still run from t3team-index.css unchanged — motion carries the state;
 * `prefers-reduced-motion` stills everything (module media query + the
 * variant CSS + the production block).
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

/** One dot — identical DOM to AgentsPanelStatusDot / the working-row cell.
 *  `production` stamps the shared orb class so the card renders the
 *  PRODUCTION paint (t3team-statusOrb.css) instead of a story-side copy. */
function Dot({
  state,
  index,
  className,
  production = false,
}: {
  state: string | null;
  index: number;
  className?: string;
  production?: boolean;
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
        <span className={`t3team-aci-dot${production ? " t3team-orb" : ""}`} />
      </span>
    </span>
  );
}

/** Static 8-state row — the "alignment-test story layout": one dot per state,
 *  state name underneath. */
function StateRow({ scope, production = false }: { scope: string; production?: boolean }) {
  return (
    <div className="sdv2-row">
      {STATES.map((state, i) => (
        <div key={state ?? "base"} className="sdv2-col">
          <Dot state={state} index={i} className={scope} production={production} />
          <span className="sdv2-state-label">{STATE_LABELS[state ?? "base"]}</span>
        </div>
      ))}
    </div>
  );
}

/** Live flip demo: three persistent dots cycling working → thinking → waiting
 *  (≈2.4s per step) so the color crossfade between states is visible. */
function FlipDemo({
  scope,
  autoCycle,
  production = false,
}: {
  scope: string;
  autoCycle: boolean;
  production?: boolean;
}) {
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
          <Dot state={state} index={i + 4} className={scope} production={production} />
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
  production = false,
}: {
  scope: string;
  letter: string;
  name: string;
  technique: string;
  paletteNote: string;
  children: React.ReactNode;
  /** Extra scope class(es) this card inherits paint from (B inherits A). */
  alsoInherits?: string;
  /** Production card: no story-side scope — the dots paint through the
   *  shared t3team-statusOrb.css module. */
  production?: boolean;
}) {
  return (
    <div
      className={`w-[620px] rounded-xl border border-border/70 bg-card p-4 shadow-sm ${
        production ? "" : `${alsoInherits} ${scope}`
      }`}
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
  /** The chosen direction — rendered through the production module. */
  production?: boolean;
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
    scope: "",
    letter: "D",
    name: "Porcelain orb (chosen — production)",
    technique:
      "SHIPPED in t3team-statusOrb.css — this card stamps `t3team-orb` and renders the shared production module, not a copy",
    paletteNote:
      "Accent-anchored theme tokens, chroma nudged up slightly. The sheen is a blurred color-mix(state, white) highlight that slowly drifts position and opacity while its color follows the state transition - the dot behaves like a lit orb. The waiting state's old hard ring is a soft halo (no layout impact) and the flip-demo labels reserve width so state changes never reflow the row.",
    production: true,
  },
];

function DotColorVariants({ autoCycle, reducedMotion, focus, zoom }: DotColorVariantsProps) {
  return (
    <div className="flex w-full flex-col items-center gap-6 px-10 py-10 pb-16">
      {reducedMotion ? (
        <style>{`[class*="sdv2-v"] .t3team-aci-cell, [class*="sdv2-v"] .t3team-aci-cell > span::before, [class*="sdv2-v"] .t3team-aci-dot, .t3team-orb, .t3team-orb::after { animation: none !important; transition: none !important; box-shadow: none !important; } [class*="sdv2-v"] .t3team-aci-dot, .t3team-orb { opacity: 0.55 !important; }`}</style>
      ) : null}

      <div style={{ zoom }}>
        {VARIANTS.filter((variant) => focus === "all" || variant.id === focus).map((variant) => (
          <VariantCard
            key={variant.id}
            scope={variant.scope}
            alsoInherits={variant.alsoInherits ?? ""}
            production={variant.production ?? false}
            letter={variant.letter}
            name={variant.name}
            technique={variant.technique}
            paletteNote={variant.paletteNote}
          >
            <StateRow scope={variant.scope} production={variant.production ?? false} />
            <FlipDemo
              scope={variant.scope}
              autoCycle={autoCycle}
              production={variant.production ?? false}
            />
          </VariantCard>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground/70">
        All four variants paint the production dot DOM — shared keyframes, the waiting halo, and the
        dead-center alignment from the GHE #201 alignment-test story are inherited untouched
        (variants change paint only). Card D renders the PRODUCTION paint (t3team-statusOrb.css).
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
