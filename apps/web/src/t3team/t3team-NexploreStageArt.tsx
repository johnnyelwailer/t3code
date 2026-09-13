import { useCallback, useEffect, useRef, useState } from "react";

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

const STRIP_HEIGHT = 96;

/**
 * Orb placement is MEASURED, not hardcoded. The sidebar is resizable (min 256px, no max) and the
 * SVG is `xMinYMin slice` with a height-driven scale, so a fixed `cx` is pinned to a fixed pixel
 * offset from the LEFT while the header toggle is anchored to the RIGHT and slides with the width;
 * any constant eventually collides. The orb therefore sits in the widest gap actually free of
 * header content, remeasured on every header resize — which also covers macOS without a platform
 * branch: desktop's titlebar inset makes the LEFT gap the widest, so the orb lands behind the
 * traffic lights on its own; in fullscreen the inset drops and the middle gap wins again.
 */
type OrbPlacement = { cx: number; cy: number; r: number };

/** Radius in px. Fixed: the orb descends rather than shrinking when space runs out. */
const ORB_RADIUS_PX = 46;
/** Breathing room between the orb and the nearest content box. */
const ORB_CONTENT_MARGIN_PX = 12;
/** Centre height while the orb sits in the header band. */
const ORB_BAND_CY_PX = 18;
/** Header band the orb sinks past when squeezed — `--workspace-topbar-height`. */
const HEADER_BAND_PX = 52;
// The full-squeeze centre derives per measurement (`HEADER_BAND_PX + radius + 4`) so the circle
// clears the band rather than leaving its top third inside it.

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Widest horizontal run of the header not covered by a child element, in px from the header's left
 * edge. Children are read generically rather than by selector, so a header that gains a control
 * later is accounted for without touching this file.
 */
/**
 * A leading run at least this wide is the macOS traffic-light reserve, not incidental padding.
 *
 * Off-mac the brand starts at `--sidebar-content-inset` + `--sidebar-row-content-inset` = 18px, so
 * the leading run is far below this. On macOS desktop `resolveProjectSidebarBrandInset` pushes it
 * to `--workspace-controls-left` = 90px, which clears it. The threshold sits between those two
 * rather than near either, so neither a slightly roomier off-mac header nor a slightly tighter
 * reserve flips the decision.
 *
 * Detecting the reserve by its shape rather than by `navigator.platform` also means fullscreen
 * needs no special case: the inset drops, the brand slides back to 18px, and the run stops
 * qualifying on its own.
 */
const TITLEBAR_RESERVE_MIN_PX = 72;

function measureFreeGap(host: HTMLElement, selfContainer: Element | null): { start: number; end: number } {
  const hostRect = host.getBoundingClientRect();
  const occupied: Array<[number, number]> = [];
  for (const child of host.children) {
    if (child === selfContainer || child.contains(selfContainer)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    // Decorative layers are not content: the t3team header's pack-background layer is absolute
    // inset-0 + pointer-events-none, so counting it read the whole header as occupied and sank
    // the orb off the strip. It never blocks the pointer; painted opaque, it hides the art anyway.
    if (getComputedStyle(child).pointerEvents === "none") continue;
    occupied.push([rect.left - hostRect.left, rect.right - hostRect.left]);
  }
  occupied.sort((a, b) => a[0] - b[0]);

  // The titlebar reserve wins over a merely wider run: on macOS desktop the orb belongs BEHIND
  // the native window buttons, and widest-gap alone put it in the middle on a wide sidebar.
  const leadingEnd = occupied.length > 0 ? Math.max(0, occupied[0]![0]) : hostRect.width;
  if (leadingEnd >= TITLEBAR_RESERVE_MIN_PX) return { start: 0, end: leadingEnd };

  let best = { start: 0, end: 0 };
  let cursor = 0;
  const consider = (start: number, end: number) => {
    if (end - start > best.end - best.start) best = { start, end };
  };
  for (const [start, end] of occupied) {
    consider(cursor, Math.max(cursor, start));
    cursor = Math.max(cursor, end);
  }
  consider(cursor, hostRect.width);
  // Content that tiles the header completely (full-width wrappers) leaves no free run: fall back
  // to the horizontal centre rather than pinning the orb half-clipped at the left edge.
  if (best.end - best.start <= 0) return { start: hostRect.width / 2, end: hostRect.width / 2 };
  return best;
}

const ORB_FILL: Readonly<Record<"orb" | "orbAlt", string>> = {
  orb: "var(--stage-nx-orb, #f7cbed)",
  orbAlt: "var(--stage-nx-orb-alt, var(--stage-nx-orb, #f7cbed))",
};

const GROUND_FILL = "var(--stage-nx-ground, #f05a0a)";

/**
 * Sidebar header strip. The orb is positioned from a live measurement of the header — see
 * {@link measureFreeGap}. Exported for the story, which drives it at several sidebar widths.
 */
export function T3TeamNexploreStripArt() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [orb, setOrb] = useState<OrbPlacement | null>(null);

  const remeasure = useCallback(() => {
    const svg = svgRef.current;
    const host = svg?.parentElement?.parentElement ?? svg?.parentElement ?? null;
    if (!svg || !host) return;
    const svgHeight = svg.getBoundingClientRect().height;
    if (svgHeight <= 0) return;

    // The viewBox is height-driven under `slice`, so this converts both axes.
    const unitsPerPx = STRIP_HEIGHT / svgHeight;
    const gap = measureFreeGap(host, svg.parentElement);
    const gapWidth = gap.end - gap.start;

    // The orb keeps its size and SINKS when the gap tightens — it never shrinks.
    //
    // The two thresholds make that safe. It fits the gap outright while the gap is at least its
    // diameter, so anywhere in that range it can sit in the header band without touching content.
    // Below the diameter it cannot fit at any height, so it must be clear of the band entirely.
    // Interpolating between the two lands exactly at full clearance the moment it stops fitting,
    // so the descent is continuous and there is no width at which it overlaps.
    const roomy = 2 * (ORB_RADIUS_PX + ORB_CONTENT_MARGIN_PX);
    const tight = 2 * ORB_RADIUS_PX;
    const sink = clamp((roomy - gapWidth) / (roomy - tight), 0, 1);
    const clearedCyPx = HEADER_BAND_PX + ORB_RADIUS_PX + 4;
    const cyPx = ORB_BAND_CY_PX + sink * (clearedCyPx - ORB_BAND_CY_PX);

    setOrb({
      cx: ((gap.start + gap.end) / 2) * unitsPerPx,
      cy: cyPx * unitsPerPx,
      r: ORB_RADIUS_PX * unitsPerPx,
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    const host = svg?.parentElement?.parentElement ?? svg?.parentElement ?? null;
    if (!host) return;
    remeasure();
    // Watches the header, not just the window: the sidebar resizes without a window resize.
    const observer = new ResizeObserver(remeasure);
    observer.observe(host);
    for (const child of host.children) observer.observe(child);
    return () => observer.disconnect();
  }, [remeasure]);

  return (
    <svg
      ref={svgRef}
      className="stage-art stage-nexplore h-full w-full"
      fill="none"
      preserveAspectRatio="xMinYMin slice"
      viewBox={`0 0 8192 ${STRIP_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100%" height={STRIP_HEIGHT} style={{ fill: GROUND_FILL }} />
      <g className="stage-nexplore-orbs">
        {orb ? (
          <circle cx={orb.cx} cy={orb.cy} r={orb.r} style={{ fill: ORB_FILL.orb }} />
        ) : null}
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
  return compact ? <NexploreButtonArt /> : <T3TeamNexploreStripArt />;
}
