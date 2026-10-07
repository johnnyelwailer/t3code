import type { T3TeamPrExplainerStep } from "@t3tools/contracts";
import type { CSSProperties } from "react";

import { cn } from "~/lib/utils";

import { PR_EXPLAINER_STEP_KIND } from "./t3team-prExplainerStepKind";
import type { PrExplainerPlayerState } from "./t3team-usePrExplainerPlayer";

/**
 * The chapter rail: one segment per step, tinted by kind. The active segment carries the step
 * clock — its fill is what advances autoplay. Narrow players get dots instead of segments.
 * `pending` reserves room for steps still being written.
 */
export function PrExplainerRail({
  steps,
  pending,
  player,
}: {
  steps: ReadonlyArray<T3TeamPrExplainerStep>;
  pending: number;
  player: PrExplainerPlayerState;
}) {
  const clockStyle = {
    "--pxp-step-ms": `${player.stepMs}ms`,
    "--pxp-clock-state": player.running ? "running" : "paused",
  } as CSSProperties;
  return (
    <nav aria-label="Steps" className="min-w-0">
      <ol className="flex items-center gap-1 @max-[24rem]:flex-wrap @max-[24rem]:gap-1.5">
        {steps.map((step, index) => {
          const kind = PR_EXPLAINER_STEP_KIND[step.kind];
          const active = index === player.index;
          const done = index < player.index;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 @max-[24rem]:flex-none">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                aria-label={`Step ${index + 1}, ${kind.label}: ${step.caption}`}
                onClick={() => player.goAndPause(index)}
                className="group/seg relative flex h-5 w-full min-w-2.5 cursor-pointer items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[24rem]:size-4 @max-[24rem]:justify-center"
              >
                {/* Wide: a segment bar. */}
                <span
                  className={cn(
                    "relative h-1.5 w-full overflow-hidden rounded-full transition-[height] group-hover/seg:h-2 @max-[24rem]:hidden",
                    done || (active && !player.playing) ? kind.segmentDone : kind.segment,
                    !done && !active && step.kind !== "check" && "bg-muted",
                  )}
                >
                  {active && player.playing ? (
                    <span
                      // Remount per step and speed so the clock restarts from zero.
                      key={`${step.id}:${player.stepMs}`}
                      className={cn("t3team-pxp-clock absolute inset-0", kind.segmentDone)}
                      style={clockStyle}
                      onAnimationEnd={player.onStepElapsed}
                    />
                  ) : null}
                </span>
                {/* Narrow: a dot. */}
                <span
                  aria-hidden
                  className={cn(
                    "hidden size-2 rounded-full @max-[24rem]:block",
                    done ? kind.segmentDone : active ? kind.segmentDone : "bg-muted-foreground/25",
                    step.kind === "check" && !done && !active && "bg-warning/50",
                    active && "ring-2 ring-offset-1 ring-offset-card ring-current",
                    active && kind.text,
                  )}
                />
              </button>
            </li>
          );
        })}
        {Array.from({ length: pending }, (_, index) => (
          <li
            key={`pending-${index}`}
            aria-hidden
            className="flex min-w-0 flex-1 @max-[24rem]:flex-none"
          >
            <span className="h-1.5 w-full rounded-full border border-dashed border-border @max-[24rem]:size-2" />
          </li>
        ))}
      </ol>
    </nav>
  );
}
