/**
 * Nexplore stage art — the brand-refresh "2FORM" language, not a gradient wash.
 *
 * The brand plates (NEXPLORE_2FORM_Orange_Rosa_*.svg / _Blau_Lila_*.svg) are built from exactly
 * two ingredients: a FLAT ground in one duo colour, and FLAT circles in the other, positioned so
 * the frame hard-crops them. There are no gradients and no blur anywhere in the source art — the
 * crisp arc against flat colour IS the identity.
 *
 * Colours arrive as `--stage-nx-*` tokens so the art is themeable exactly like `--stage-art-*`
 * drives DevBlueprintArt (see `index.css`); fallbacks are the brand-manual hexes.
 *
 * TWO SEPARATE COMPOSITIONS, deliberately. The sibling variants reuse one wide viewBox for both
 * the sidebar strip and the send button, shifting x for the compact case. That cannot work for a
 * flat-shape language: the button is ~32px, which crops to roughly 38 viewBox units, so ANY slice
 * of the wide art lands inside a single shape and the button renders as one flat fill. The button
 * therefore gets its own square composition whose arc is sized to be visible at 32px.
 *
 * Both compositions keep the saturated GROUND under the content (sidebar label, send arrow) and
 * let the softer duo colour intrude only as edge arcs — the label/arrow contrast depends on it.
 */

const STRIP_TILE_WIDTH = 1024;
const STRIP_HEIGHT = 96;
/** Covers STAGE_BACKDROP_VIEW_BOX's 8192 units. */
const STRIP_TILE_COUNT = 8;

/**
 * Arcs intrude from the top and bottom edges, and stay clear of x < 200 / y < 45 — that box is
 * where `sidebar-brand` sits, and it has to stay flat ground so the label keeps its contrast.
 */
const STRIP_ORBS: ReadonlyArray<{
  cx: number;
  cy: number;
  r: number;
  token: "orb" | "orbAlt";
  opacity?: number;
}> = [
  { cx: 300, cy: 152, r: 122, token: "orb" },
  { cx: 700, cy: -58, r: 108, token: "orbAlt", opacity: 0.9 },
  { cx: 980, cy: 142, r: 92, token: "orb", opacity: 0.85 },
];

const ORB_FILL: Readonly<Record<"orb" | "orbAlt", string>> = {
  orb: "var(--stage-nx-orb, #f7cbed)",
  orbAlt: "var(--stage-nx-orb-alt, var(--stage-nx-orb, #f7cbed))",
};

const GROUND_FILL = "var(--stage-nx-ground, #f05a0a)";

/** Sidebar header strip: wide, so sidebar resizing reveals more canvas instead of zooming. */
function NexploreStripArt() {
  return (
    <svg
      className="stage-art stage-nexplore h-full w-full"
      fill="none"
      preserveAspectRatio="xMinYMin slice"
      viewBox={`0 0 8192 ${STRIP_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100%" height={STRIP_HEIGHT} style={{ fill: GROUND_FILL }} />
      <g className="stage-nexplore-orbs">
        {Array.from({ length: STRIP_TILE_COUNT }, (_unused, tile) =>
          STRIP_ORBS.map((orb) => (
            <circle
              key={`${tile}-${orb.cx}-${orb.cy}`}
              cx={orb.cx + tile * STRIP_TILE_WIDTH}
              cy={orb.cy}
              r={orb.r}
              fillOpacity={orb.opacity ?? 1}
              style={{ fill: ORB_FILL[orb.token] }}
            />
          )),
        )}
      </g>
    </svg>
  );
}

/**
 * Send-button fill: square, and deliberately NOT the strip's hard-edged language.
 *
 * At 32px the whole button spans ~32 user units, so a crisp arc either misses the button entirely
 * or fills it as one flat colour — the crop is simply too small to carry a shape. So the duo reads
 * as heavily blurred colour instead (`.stage-nexplore-compact .stage-nexplore-orbs` blurs in
 * index.css): the orbs become a soft field, and the send arrow stays crisp on top of it.
 *
 * Orbs are oversized and pushed past the edges so the blur never reveals a hard rim inside the
 * button's rounded clip.
 */
function NexploreButtonArt() {
  return (
    <svg
      className="stage-art stage-nexplore stage-nexplore-compact h-full w-full"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" style={{ fill: GROUND_FILL }} />
      <g className="stage-nexplore-orbs">
        <circle cx="30" cy="27" r="17" style={{ fill: ORB_FILL.orb }} />
        <circle cx="1" cy="3" r="13" fillOpacity="0.85" style={{ fill: ORB_FILL.orbAlt }} />
        <circle cx="26" cy="2" r="9" fillOpacity="0.5" style={{ fill: ORB_FILL.orbAlt }} />
      </g>
    </svg>
  );
}

export function T3TeamNexploreStageArt({ compact = false }: { compact?: boolean }) {
  return compact ? <NexploreButtonArt /> : <NexploreStripArt />;
}
