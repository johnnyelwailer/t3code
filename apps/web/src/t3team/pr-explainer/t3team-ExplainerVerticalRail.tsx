import { useEffect, useRef, type CSSProperties } from "react";

import type { T3TeamExplainerStep } from "./model/t3team-explainer";
import { Tooltip, TooltipPopup, TooltipTrigger, cn } from "./t3team-explainerHostKit";
import { EXPLAINER_STEP_KIND, explainerStepLabel } from "./t3team-explainerStepKind";
import type { ExplainerPlayerState } from "./t3team-useExplainerPlayer";

/** The step's dot on the connector: its number, or its kind's icon for a check. */
function StepNode({
  step,
  index,
  active,
  done,
}: {
  step: T3TeamExplainerStep;
  index: number;
  active: boolean;
  done: boolean;
}) {
  const kind = EXPLAINER_STEP_KIND[step.kind];
  const check = step.kind === "check";
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-2xs font-medium tabular-nums transition-colors",
        active
          ? cn("border-current bg-card shadow-xs ring-4 ring-current/15", kind.text)
          : done
            ? cn("border-transparent", kind.segmentDone, "text-background")
            : cn("border-border bg-card text-muted-foreground", check && kind.text),
      )}
    >
      {check ? <kind.Icon className="size-3" /> : index + 1}
    </span>
  );
}

/**
 * One step of the vertical rail: node, label, a one-line caption, and for the active step the
 * clock that draws the tour's progress. The connector runs through the nodes' centres.
 */
function VerticalStep({
  step,
  index,
  total,
  player,
}: {
  step: T3TeamExplainerStep;
  index: number;
  total: number;
  player: ExplainerPlayerState;
}) {
  const kind = EXPLAINER_STEP_KIND[step.kind];
  const label = explainerStepLabel(step);
  const active = index === player.index;
  const done = index < player.index;
  const clockStyle = {
    "--xp-step-ms": `${player.stepMs}ms`,
    "--xp-clock-state": player.running ? "running" : "paused",
  } as CSSProperties;
  return (
    <li
      data-xp-rail-index={index}
      {...(active ? { "data-xp-rail-active": "" } : {})}
      className="relative"
    >
      {index < total - 1 ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-8 -bottom-1 left-[1.125rem] w-px",
            done ? "bg-foreground/30" : "bg-border",
          )}
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`Step ${index + 1} of ${total}, ${label}: ${step.caption}`}
              onClick={() => player.goAndPause(index)}
              className={cn(
                "group/step flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-accent/60" : "hover:bg-accent/35",
              )}
            />
          }
        >
          <StepNode step={step} index={index} active={active} done={done} />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-xs leading-6",
                active ? "font-semibold text-foreground" : "font-medium text-foreground/80",
                step.kind === "check" && kind.text,
              )}
            >
              {label}
            </span>
            <span className="-mt-0.5 block truncate text-2xs text-muted-foreground">
              {step.caption}
            </span>
            {active ? (
              <span
                aria-hidden
                className="mt-1.5 block h-0.5 overflow-hidden rounded-full bg-muted-foreground/20"
              >
                {player.playing ? (
                  <span
                    // Restarts with the step clock: a new step or speed.
                    key={player.clockKey}
                    className={cn("t3team-xp-clock block h-full", kind.segmentDone)}
                    style={clockStyle}
                  />
                ) : (
                  <span className={cn("block h-full w-full", kind.segmentDone)} />
                )}
              </span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="right">
          <span className="font-medium">
            {index + 1}. {label}
          </span>
          <span className="block text-muted-foreground">{step.caption}</span>
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}

/**
 * The chapter rail for a wide player: a polished vertical stepper on the left. It scrolls inside
 * itself when the steps outgrow it and keeps the active step in view. `pending` reserves rows for
 * steps still being written.
 */
export function ExplainerVerticalRail({
  steps,
  pending,
  player,
}: {
  steps: ReadonlyArray<T3TeamExplainerStep>;
  pending: number;
  player: ExplainerPlayerState;
}) {
  const railRef = useRef<HTMLElement>(null);
  const total = steps.length + pending;

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>(`[data-xp-rail-index="${player.index}"]`);
    if (!rail || !active || rail.scrollHeight <= rail.clientHeight) return;
    const top = active.offsetTop - (rail.clientHeight - active.offsetHeight) / 2;
    rail.scrollTo({ top, behavior: player.reducedMotion ? "auto" : "smooth" });
  }, [player.index, player.reducedMotion]);

  return (
    <nav
      ref={railRef}
      aria-label="Steps"
      data-xp-rail="vertical"
      className="sticky top-0 max-h-[min(36rem,80vh)] min-w-0 self-start overflow-y-auto overscroll-y-contain pr-1 [scrollbar-width:thin]"
    >
      <ol className="space-y-0.5">
        {steps.map((step, index) => (
          <VerticalStep key={step.id} step={step} index={index} total={total} player={player} />
        ))}
        {Array.from({ length: pending }, (_, offset) => (
          <li
            key={`pending-${offset}`}
            aria-hidden
            className="flex items-center gap-2.5 px-1.5 py-2"
          >
            <span className="size-6 shrink-0 rounded-full border border-dashed border-border" />
            <span className="h-2 w-2/3 rounded-full bg-muted-foreground/10" />
          </li>
        ))}
      </ol>
    </nav>
  );
}
