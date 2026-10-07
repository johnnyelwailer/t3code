import type { T3TeamExplainerStep } from "./model/t3team-explainer";
import { Button, ChevronDownIcon, ChevronUpIcon, cn } from "./t3team-explainerHostKit";
import { useState } from "react";

import { ExplainerAskButton } from "./t3team-ExplainerAskButton";
import { ExplainerAskThreads, useExplainerSectionThreads } from "./t3team-ExplainerAskThread";
import { ExplainerBlockView } from "./t3team-ExplainerBlock";
import { layoutExplainerBlocks, type ExplainerPlacedBlock } from "./t3team-explainerLayout";
import { EXPLAINER_STEP_KIND } from "./t3team-explainerStepKind";

/**
 * A main/aside band. Wide: two columns. Narrow: the column wrappers dissolve (`contents`) and
 * each block takes its reading-order slot, so the step stacks exactly as authored.
 */
function Band({
  step,
  stepIndex,
  main,
  aside,
}: {
  step: T3TeamExplainerStep;
  stepIndex: number;
  main: ReadonlyArray<ExplainerPlacedBlock>;
  aside: ReadonlyArray<ExplainerPlacedBlock>;
}) {
  const split = main.length > 0 && aside.length > 0;
  const column = (items: ReadonlyArray<ExplainerPlacedBlock>) => (
    <div
      className={cn(
        "contents",
        split &&
          "@min-[44rem]:flex @min-[44rem]:min-w-0 @min-[44rem]:flex-col @min-[44rem]:gap-2.5",
      )}
    >
      {items.map(({ block, order }) => (
        <div key={block.id} className="min-w-0" style={{ order }}>
          <ExplainerBlockView step={step} stepIndex={stepIndex} block={block} />
        </div>
      ))}
    </div>
  );
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2.5",
        split &&
          "@min-[44rem]:grid @min-[44rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @min-[44rem]:items-start",
      )}
    >
      {column(main)}
      {column(aside)}
    </div>
  );
}

/** One step: its caption, then its blocks in rows, with detail blocks folded under the rest. */
export function ExplainerStepView({
  step,
  stepIndex,
  stepCount,
}: {
  step: T3TeamExplainerStep;
  stepIndex: number;
  stepCount: number;
}) {
  const kind = EXPLAINER_STEP_KIND[step.kind];
  const captionThreads = useExplainerSectionThreads(step.id, "caption");
  const [showDetail, setShowDetail] = useState(false);
  const { rows, detailCount } = layoutExplainerBlocks(step.blocks, showDetail);
  return (
    <div className="space-y-2.5">
      <div className="group/caption">
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
              of {stepCount}, {kind.label}:
            </span>
          </span>
          <p
            // Keyed by step so the caption replays its entrance on every step change.
            key={step.id}
            data-xp-text="caption"
            className={cn(
              "t3team-xp-caption-in line-clamp-4 min-w-0 flex-1 text-sm leading-snug font-medium text-pretty text-foreground @min-[34rem]:text-base",
              step.kind === "check" && "text-warning-foreground",
            )}
          >
            {step.caption}
          </p>
          <ExplainerAskButton
            anchor={{ stepId: step.id, target: { kind: "caption" }, quote: step.caption }}
            className="opacity-0 group-focus-within/caption:opacity-100 group-hover/caption:opacity-100 pointer-coarse:opacity-100"
          />
        </div>
        <ExplainerAskThreads threads={captionThreads} className="mt-1.5 pl-7" />
      </div>
      {rows.map((row) =>
        row.kind === "full" ? (
          <ExplainerBlockView
            key={row.item.block.id}
            step={step}
            stepIndex={stepIndex}
            block={row.item.block}
          />
        ) : (
          <Band
            key={(row.main[0] ?? row.aside[0])!.block.id}
            step={step}
            stepIndex={stepIndex}
            main={row.main}
            aside={row.aside}
          />
        ),
      )}
      {detailCount > 0 ? (
        <Button
          variant="ghost-muted"
          size="xs"
          aria-expanded={showDetail}
          onClick={() => setShowDetail(!showDetail)}
        >
          {showDetail ? <ChevronUpIcon /> : <ChevronDownIcon />}
          {showDetail ? "Show less" : `Show more (${detailCount})`}
        </Button>
      ) : null}
    </div>
  );
}
