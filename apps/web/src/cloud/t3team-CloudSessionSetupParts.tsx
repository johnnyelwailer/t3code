/**
 * The pieces of the setup card: the step list and the live readout (bar and estimate). Split from
 * the card so the part that follows the clock is a small leaf and the rest never re-renders on a tick.
 */
import { CheckIcon } from "lucide-react";
import { type CSSProperties } from "react";

import { cn } from "~/lib/utils";
import {
  readCloudSetup,
  type CloudSetupModel,
  type CloudSetupStepView,
} from "./t3team-cloudSessionSetupProgress";

function StepMarker({ status }: { readonly status: CloudSetupStepView["status"] }) {
  if (status === "done") {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <CheckIcon aria-hidden className="size-2.5 stroke-3" />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-primary/40">
        <span className="t3team-setup-step-dot size-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  return <span className="size-4 shrink-0 rounded-full border border-border" />;
}

export function StepList({ steps }: { readonly steps: CloudSetupModel["steps"] }) {
  return (
    <ol className="space-y-1.5" aria-label="Setup steps">
      {steps.map((step) => (
        <li
          key={step.id}
          data-cloud-setup-step={step.id}
          data-cloud-setup-step-status={step.status}
          aria-current={step.status === "current" ? "step" : undefined}
          className="flex items-center gap-2.5 text-sm leading-5"
        >
          <StepMarker status={step.status} />
          <span
            className={cn(
              step.status === "done" && "text-muted-foreground",
              step.status === "upcoming" && "text-muted-foreground/60",
              step.status === "current" && "t3team-setup-shimmer font-medium text-foreground",
            )}
          >
            {step.label}
          </span>
          {step.status === "done" ? <span className="sr-only">, done</span> : null}
        </li>
      ))}
    </ol>
  );
}

function SetupFill({ progress }: { readonly progress: number }) {
  const style: CSSProperties & { "--t3team-setup-from": string } = {
    "--t3team-setup-from": `${(progress * 100).toFixed(2)}%`,
    width: `${(progress * 100).toFixed(2)}%`,
  };
  return <div className="t3team-setup-fill h-full rounded-full bg-primary" style={style} />;
}

/** The only part that follows the clock: the bar and the estimate. */
export function SetupLiveReadout({
  model,
  elapsedSeconds,
}: {
  readonly model: CloudSetupModel;
  readonly elapsedSeconds: number;
}) {
  const readout = readCloudSetup(model, elapsedSeconds);
  const working = model.stage === "working";
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label="Cloud session setup"
        aria-valuetext={readout.valueText}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        {working || model.stage === "ready" ? <SetupFill progress={readout.progress} /> : null}
      </div>
      {working ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
          <span
            data-cloud-setup-estimate={readout.slow ? "slow" : "estimate"}
            className={cn(
              "font-medium",
              readout.slow ? "text-warning-foreground" : "text-foreground/80",
            )}
          >
            {readout.estimateText}
          </span>
          {readout.basisText === null ? null : (
            <span className="text-muted-foreground">{readout.basisText}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
