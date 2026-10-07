import type { T3TeamPrExplainer, T3TeamPrExplainerStep } from "@t3tools/contracts";

import { PrExplainerAskButton } from "./t3team-PrExplainerAskCard";
import { PrExplainerAskThreads, usePrExplainerSectionThreads } from "./t3team-PrExplainerAskThread";
import { PrExplainerFlowMap } from "./t3team-PrExplainerFlowMap";
import { PrExplainerSequence } from "./t3team-PrExplainerSequence";
import { PrExplainerShape } from "./t3team-PrExplainerShape";
import { PrExplainerUiCompare } from "./t3team-PrExplainerUiCompare";

/**
 * Whether the step draws a visual. A diff-only step still shows the map when the explainer has
 * one, so the reader keeps the picture between steps.
 */
export function prExplainerStepHasVisual(
  explainer: T3TeamPrExplainer,
  step: T3TeamPrExplainerStep,
) {
  return step.visual.kind !== "none" || explainer.map !== undefined;
}

function VisualBody({
  explainer,
  step,
  stepIndex,
  reducedMotion,
}: {
  explainer: T3TeamPrExplainer;
  step: T3TeamPrExplainerStep;
  stepIndex: number;
  reducedMotion: boolean;
}) {
  const visual = step.visual;
  switch (visual.kind) {
    case "uiCompare":
      return <PrExplainerUiCompare key={step.id} visual={visual} />;
    case "sequence":
      return <PrExplainerSequence key={step.id} visual={visual} />;
    case "shape":
      return <PrExplainerShape visual={visual} />;
    case "map":
    case "none":
      return (
        <PrExplainerFlowMap
          explainer={explainer}
          stepIndex={stepIndex}
          reducedMotion={reducedMotion}
        />
      );
  }
}

const VISUAL_NAME = {
  map: "map",
  none: "map",
  uiCompare: "before and after",
  sequence: "call sequence",
  shape: "data shape",
} as const;

/** The step's visual with its Ask affordance and the threads anchored to it. */
export function PrExplainerVisual(props: {
  explainer: T3TeamPrExplainer;
  step: T3TeamPrExplainerStep;
  stepIndex: number;
  reducedMotion: boolean;
}) {
  const threads = usePrExplainerSectionThreads(props.step.id, "visual");
  const name = VISUAL_NAME[props.step.visual.kind];
  return (
    <div className="group/visual relative min-w-0" data-pxp-section="visual">
      <div className="rounded-lg border border-border/70 bg-background/60 p-2">
        <VisualBody {...props} />
      </div>
      <PrExplainerAskButton
        anchor={{ stepId: props.step.id, target: { kind: "visual" }, quote: name }}
        variant="outline"
        className="absolute top-1.5 right-1.5 opacity-0 group-focus-within/visual:opacity-100 group-hover/visual:opacity-100 pointer-coarse:opacity-100"
      />
      <PrExplainerAskThreads threads={threads} className="mt-1.5" />
    </div>
  );
}
