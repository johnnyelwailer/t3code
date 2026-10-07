import type { T3TeamExplainerStep } from "./model/t3team-explainer";
import { useEffect, useRef, type CSSProperties } from "react";

import { ExplainerRailSegment } from "./t3team-ExplainerRailSegment";
import type { ExplainerPlayerState } from "./t3team-useExplainerPlayer";

/** The active step and its neighbours take more of a tight rail, so their labels fit. */
function weightOf(distance: number) {
  if (distance === 0) return 2.5;
  return distance === 1 ? 1.5 : 1;
}

/**
 * A segment's flex. A few steps on a wide rail share it evenly; a long or tight rail (below
 * ~36rem, or past six steps) gives the room to the steps near the active one.
 */
export function explainerRailFlex(distance: number, count: number) {
  return {
    className:
      count > 6
        ? "flex-[var(--xp-w)_1_0]"
        : "flex-[1_1_0] @max-[36rem]/rail:flex-[var(--xp-w)_1_0]",
    style: { "--xp-w": weightOf(distance) } as CSSProperties,
  };
}

/**
 * The chapter rail: one segment per step, tinted by kind, labelled underneath. Each segment is
 * its own container, so its label shows, truncates, becomes the step number, then a dot, as its
 * share of the width shrinks. With many steps the active one and its neighbours take more of
 * the width; past what fits, the rail scrolls and keeps the active step in view.
 * `pending` reserves room for steps still being written.
 */
export function ExplainerRail({
  steps,
  pending,
  player,
}: {
  steps: ReadonlyArray<T3TeamExplainerStep>;
  pending: number;
  player: ExplainerPlayerState;
}) {
  const railRef = useRef<HTMLElement>(null);
  const count = steps.length + pending;
  const pendingFlex = (index: number) => {
    const flex = explainerRailFlex(Math.abs(index - player.index), count);
    return {
      className: `flex min-w-2 flex-col gap-1 px-px py-1 ${flex.className}`,
      style: flex.style,
    };
  };

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>(`[data-xp-rail-index="${player.index}"]`);
    if (!rail || !active || rail.scrollWidth <= rail.clientWidth) return;
    const left = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
    rail.scrollTo({ left, behavior: player.reducedMotion ? "auto" : "smooth" });
  }, [player.index, player.reducedMotion]);

  return (
    <nav
      ref={railRef}
      aria-label="Steps"
      className="@container/rail -mx-1 min-w-0 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none]"
    >
      <ol className="flex min-w-full">
        {steps.map((step, index) => (
          <ExplainerRailSegment
            key={step.id}
            step={step}
            index={index}
            total={count}
            flex={explainerRailFlex(Math.abs(index - player.index), count)}
            player={player}
          />
        ))}
        {Array.from({ length: pending }, (_, offset) => (
          <li key={`pending-${offset}`} aria-hidden {...pendingFlex(steps.length + offset)}>
            <span className="h-1.5 w-full rounded-full border border-dashed border-border" />
            <span className="h-3" />
          </li>
        ))}
      </ol>
    </nav>
  );
}
