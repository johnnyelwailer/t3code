import type { T3TeamExplainerStep } from "./model/t3team-explainer";
import { Tooltip, TooltipPopup, TooltipTrigger, cn } from "./t3team-explainerHostKit";
import type { CSSProperties } from "react";

import { EXPLAINER_STEP_KIND, explainerStepLabel } from "./t3team-explainerStepKind";
import type { ExplainerPlayerState } from "./t3team-useExplainerPlayer";

/**
 * One rail segment: a 24px-tall target over the bar and its label. Segments abut, so the whole
 * strip is clickable; the gap between bars is padding, not dead space. Its container width
 * picks what the label shows: the label, the step number, or nothing (the bar is a dot).
 */
export function ExplainerRailSegment({
  step,
  index,
  total,
  flex,
  player,
}: {
  step: T3TeamExplainerStep;
  index: number;
  total: number;
  flex: { readonly className: string; readonly style: CSSProperties };
  player: ExplainerPlayerState;
}) {
  const kind = EXPLAINER_STEP_KIND[step.kind];
  const label = explainerStepLabel(step);
  const active = index === player.index;
  const done = index < player.index;
  const check = step.kind === "check";
  const clockStyle = {
    "--xp-step-ms": `${player.stepMs}ms`,
    "--xp-clock-state": player.running ? "running" : "paused",
  } as CSSProperties;
  return (
    <li
      className={cn("@container/seg flex min-w-2", flex.className)}
      style={flex.style}
      data-xp-rail-index={index}
      {...(active ? { "data-xp-rail-active": "" } : {})}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`Step ${index + 1} of ${total}, ${label}: ${step.caption}`}
              onClick={() => player.goAndPause(index)}
              className="group/seg flex min-h-6 w-full min-w-0 cursor-pointer flex-col justify-center gap-1 rounded-sm px-px py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <span
            className={cn(
              "relative h-1.5 w-full overflow-hidden rounded-full transition-[height] group-hover/seg:h-2 @max-[0.9rem]/seg:mx-auto @max-[0.9rem]/seg:size-1.5 @max-[0.9rem]/seg:group-hover/seg:size-2",
              done || (active && !player.playing)
                ? kind.segmentDone
                : check || active
                  ? kind.segment
                  : "bg-muted-foreground/20",
              active && "@max-[0.9rem]/seg:ring-2 @max-[0.9rem]/seg:ring-current",
              active && kind.text,
            )}
          >
            {active && player.playing ? (
              <span
                // Restarts with the step clock: a new step or speed.
                key={player.clockKey}
                aria-hidden
                className={cn("t3team-xp-clock absolute inset-0", kind.segmentDone)}
                style={clockStyle}
              />
            ) : null}
          </span>
          <span
            aria-hidden
            className={cn(
              "flex h-3 min-w-0 justify-center text-3xs leading-3 @max-[0.9rem]/seg:hidden",
              active ? "font-medium text-foreground" : "text-muted-foreground",
              check && "text-warning-foreground",
            )}
          >
            <span className="min-w-0 truncate @max-[3.5rem]/seg:hidden">{label}</span>
            <span className="hidden tabular-nums @max-[3.5rem]/seg:inline">{index + 1}</span>
          </span>
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          <span className="font-medium">
            {index + 1}. {label}
          </span>
          <span className="block text-muted-foreground">{step.caption}</span>
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}
