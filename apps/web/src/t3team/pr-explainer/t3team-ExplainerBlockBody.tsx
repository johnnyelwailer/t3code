import type { T3TeamExplainerBlock, T3TeamExplainerStep } from "./model/t3team-explainer";
import { ExplainerCodeBlock } from "./t3team-ExplainerCodeBlock";
import { ExplainerDiffBlock } from "./t3team-ExplainerDiffBlock";
import { ExplainerFlowMap } from "./t3team-ExplainerFlowMap";
import { ExplainerImageBlock, ExplainerVideoBlock } from "./t3team-ExplainerMedia";
import { ExplainerSequence } from "./t3team-ExplainerSequence";
import { ExplainerShape } from "./t3team-ExplainerShape";
import {
  ExplainerCalloutBlock,
  ExplainerChecklistBlock,
  ExplainerKeyValueBlock,
  ExplainerTableBlock,
  ExplainerUnsupportedBlock,
} from "./t3team-ExplainerFacts";
import { ExplainerMarkdownBlock } from "./t3team-ExplainerMarkdownBlock";
import { ExplainerUiCompare } from "./t3team-ExplainerUiCompare";
import { ExplainerWidgetBlock } from "./t3team-ExplainerWidgetBlock";

/** A framed box for pictures, so they read as one figure beside the prose. */
function Figure({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border/70 bg-background/60 p-2">{children}</div>;
}

/** Draws one block by its type. A type this build cannot draw gets a quiet placeholder. */
export function ExplainerBlockBody({
  step,
  stepIndex,
  block,
}: {
  step: T3TeamExplainerStep;
  stepIndex: number;
  block: T3TeamExplainerBlock;
}) {
  switch (block.type) {
    case "markdown":
      return <ExplainerMarkdownBlock block={block} />;
    case "diff":
      return <ExplainerDiffBlock stepId={step.id} block={block} />;
    case "code":
      return <ExplainerCodeBlock block={block} />;
    case "map":
      return (
        <Figure>
          <ExplainerFlowMap step={step} stepIndex={stepIndex} block={block} />
        </Figure>
      );
    case "sequence":
      return (
        <Figure>
          <ExplainerSequence key={step.id} block={block} />
        </Figure>
      );
    case "shape":
      return (
        <Figure>
          <ExplainerShape block={block} />
        </Figure>
      );
    case "uiCompare":
      return <ExplainerUiCompare key={block.id} block={block} />;
    case "image":
      return <ExplainerImageBlock block={block} />;
    case "video":
      return <ExplainerVideoBlock block={block} />;
    case "callout":
      return <ExplainerCalloutBlock block={block} />;
    case "keyValue":
      return <ExplainerKeyValueBlock block={block} />;
    case "table":
      return <ExplainerTableBlock block={block} />;
    case "checklist":
      return <ExplainerChecklistBlock block={block} />;
    case "widget":
      return <ExplainerWidgetBlock block={block} />;
    case "unsupported":
      return <ExplainerUnsupportedBlock block={block} />;
  }
}
