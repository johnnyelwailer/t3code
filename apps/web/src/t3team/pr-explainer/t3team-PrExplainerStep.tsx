import type { T3TeamPrExplainer, T3TeamPrExplainerStep } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

import type { PrExplainerOpenInCodeTarget } from "./t3team-prExplainerAskContext";
import { PrExplainerAskButton } from "./t3team-PrExplainerAskCard";
import { PrExplainerAskThreads, usePrExplainerSectionThreads } from "./t3team-PrExplainerAskThread";
import { PrExplainerDiffSlice } from "./t3team-PrExplainerDiffSlice";
import { PR_EXPLAINER_STEP_KIND } from "./t3team-prExplainerStepKind";
import { PrExplainerVisual, prExplainerStepHasVisual } from "./t3team-PrExplainerVisual";

/** One step: its caption, then the visual beside (wide) or above (narrow) its changed lines. */
export function PrExplainerStepView({
  explainer,
  step,
  stepIndex,
  reducedMotion,
  onOpenInCode,
}: {
  explainer: T3TeamPrExplainer;
  step: T3TeamPrExplainerStep;
  stepIndex: number;
  reducedMotion: boolean;
  onOpenInCode?: ((target: PrExplainerOpenInCodeTarget) => void) | undefined;
}) {
  const kind = PR_EXPLAINER_STEP_KIND[step.kind];
  const captionThreads = usePrExplainerSectionThreads(step.id, "caption");
  const hasVisual = prExplainerStepHasVisual(explainer, step);
  return (
    <div className="space-y-2.5">
      <div className="group/caption" data-pxp-section="caption">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 inline-flex shrink-0 items-center gap-1 text-2xs font-medium",
              kind.text,
            )}
          >
            <kind.Icon aria-hidden className="size-3.5" />
            <span className="tabular-nums">{stepIndex + 1}</span>
            <span className="sr-only">
              of {explainer.steps.length}, {kind.label}:
            </span>
          </span>
          {/* Keyed by step so the caption replays its entrance on every step change. */}
          <p
            key={step.id}
            aria-live="polite"
            className={cn(
              "t3team-pxp-caption-in min-w-0 flex-1 text-sm leading-snug font-medium text-pretty text-foreground @min-[34rem]:text-base",
              step.kind === "check" && "text-warning-foreground",
            )}
          >
            {step.caption}
          </p>
          <PrExplainerAskButton
            anchor={{ stepId: step.id, target: { kind: "caption" }, quote: step.caption }}
            className="opacity-0 group-focus-within/caption:opacity-100 group-hover/caption:opacity-100 pointer-coarse:opacity-100"
          />
        </div>
        <PrExplainerAskThreads threads={captionThreads} className="mt-1.5 pl-7" />
      </div>
      <div
        className={cn(
          "grid min-w-0 gap-2.5",
          hasVisual &&
            step.diffs.length > 0 &&
            "@min-[44rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]",
        )}
      >
        {hasVisual ? (
          <PrExplainerVisual
            explainer={explainer}
            step={step}
            stepIndex={stepIndex}
            reducedMotion={reducedMotion}
          />
        ) : null}
        {step.diffs.length > 0 ? (
          <div className="min-w-0 space-y-2">
            {step.diffs.map((slice) => (
              <PrExplainerDiffSlice
                key={slice.id}
                stepId={step.id}
                slice={slice}
                onOpenInCode={onOpenInCode}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
