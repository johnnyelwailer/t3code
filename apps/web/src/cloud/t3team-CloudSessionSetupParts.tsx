/**
 * The step list of the setup card. Split from the card so the list stays a small leaf.
 */
import { CheckIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { type CloudSetupModel, type CloudSetupStepView } from "./t3team-cloudSessionSetupProgress";

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
    <ol className="space-y-1.5" aria-label="Setup steps" data-cloud-setup-progress="steps">
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
