import type {
  T3TeamExplainerAnchor,
  T3TeamExplainerBlock,
  T3TeamExplainerStep,
} from "./model/t3team-explainer";
import { useRef } from "react";

import { ExplainerAskButton } from "./t3team-ExplainerAskButton";
import { ExplainerAskThreads, useExplainerSectionThreads } from "./t3team-ExplainerAskThread";
import { ExplainerBlockBody } from "./t3team-ExplainerBlockBody";

/** Blocks that carry their own Ask (per line) instead of one for the whole block. */
const OWN_ASK = new Set<T3TeamExplainerBlock["type"]>(["diff", "unsupported"]);

/** What the reader saw of a block, as the quote a question carries. */
function quoteOf(block: T3TeamExplainerBlock): string {
  switch (block.type) {
    case "markdown":
    case "callout":
      return block.text.slice(0, 400);
    case "code":
      return block.code.slice(0, 400);
    case "image":
    case "video":
      return block.alt;
    case "shape":
      return block.name;
    case "widget":
      return block.title ?? "";
    case "keyValue":
    case "table":
    case "checklist":
      return block.title ?? "";
    default:
      return "";
  }
}

/** One block with its Ask affordance and the threads anchored to it. */
export function ExplainerBlockView({
  step,
  stepIndex,
  block,
}: {
  step: T3TeamExplainerStep;
  stepIndex: number;
  block: T3TeamExplainerBlock;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const threads = useExplainerSectionThreads(step.id, `block:${block.id}`);
  const anchor = (): T3TeamExplainerAnchor => {
    const video = block.type === "video" ? frameRef.current?.querySelector("video") : null;
    return {
      stepId: step.id,
      target: {
        kind: "block",
        blockId: block.id,
        ...(video ? { atSeconds: Math.round(video.currentTime * 10) / 10 } : {}),
      },
      quote: quoteOf(block),
    };
  };
  return (
    <div ref={frameRef} className="group/block relative min-w-0" data-xp-block-frame={block.id}>
      <ExplainerBlockBody step={step} stepIndex={stepIndex} block={block} />
      {OWN_ASK.has(block.type) ? null : (
        <ExplainerAskButton
          anchor={anchor}
          variant="outline"
          className="absolute top-1.5 right-1.5 opacity-0 group-focus-within/block:opacity-100 group-hover/block:opacity-100 pointer-coarse:opacity-100"
        />
      )}
      {block.type === "diff" ? null : <ExplainerAskThreads threads={threads} className="mt-1.5" />}
    </div>
  );
}
