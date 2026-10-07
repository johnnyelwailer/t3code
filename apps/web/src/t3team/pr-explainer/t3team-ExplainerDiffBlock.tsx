import type { T3TeamExplainerAnchor, T3TeamExplainerDiffBlock } from "./model/t3team-explainer";
import { Fragment, useState } from "react";

import { ExplainerAskButton } from "./t3team-ExplainerAskButton";
import { ExplainerAskThreads, useExplainerSectionThreads } from "./t3team-ExplainerAskThread";
import { ExplainerDiffHeader } from "./t3team-ExplainerDiffHeader";
import { ExplainerDiffLineRow } from "./t3team-ExplainerDiffLine";
import { explainerHunkHeader, numberExplainerDiff } from "./t3team-explainerDiffLines";

/** End-exclusive, over the block's visible lines. */
interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** A 2–5 line slice of one file's diff: expandable context, line-range Ask, open in Code. */
export function ExplainerDiffBlock({
  stepId,
  block,
}: {
  stepId: string;
  block: T3TeamExplainerDiffBlock;
}) {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<LineRange | null>(null);
  const { all, focusStart, focusEnd } = numberExplainerDiff(block);
  const canExpand = all.length > block.lines.length;
  const first = expanded ? 0 : focusStart;
  const end = expanded ? all.length : focusEnd;
  const threads = useExplainerSectionThreads(stepId, `block:${block.id}`);
  const focus = all.slice(focusStart, focusEnd);
  const firstChanged = focus.find((entry) => entry.line.kind !== "context") ?? focus[0];

  const select = (index: number, extend: boolean) =>
    setRange((current) => {
      if (extend && current) {
        return { start: Math.min(current.start, index), end: Math.max(current.end, index + 1) };
      }
      return current && current.start === index && current.end === index + 1
        ? null
        : { start: index, end: index + 1 };
    });

  const anchorFor = (lines: LineRange): T3TeamExplainerAnchor => ({
    stepId,
    target: { kind: "diffLines", blockId: block.id, ...lines },
    quote: all
      .slice(lines.start, lines.end)
      .map((entry) => entry.line.content)
      .join("\n"),
  });
  const endsAt = (thread: (typeof threads)[number], index: number) =>
    thread.anchor.target.kind === "diffLines" && thread.anchor.target.end - 1 === index;

  return (
    <section
      aria-label={`Changes in ${block.path}`}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <ExplainerDiffHeader
        block={block}
        firstChanged={firstChanged}
        canExpand={canExpand}
        expanded={expanded}
        onToggleExpanded={() => setExpanded(!expanded)}
      />
      <div className="py-1" data-xp-text="block" data-xp-block={block.id}>
        {canExpand && !expanded && focusStart > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="block w-full px-2 text-left font-mono text-2xs leading-5 text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground"
          >
            {explainerHunkHeader(all)}
          </button>
        ) : null}
        {all.slice(first, end).map((entry, offset) => {
          const index = first + offset;
          const selected = range !== null && index >= range.start && index < range.end;
          return (
            <Fragment key={index}>
              <ExplainerDiffLineRow
                entry={entry}
                selected={selected}
                muted={index < focusStart || index >= focusEnd}
                onSelectLine={(event) => select(index, event.shiftKey)}
                askSlot={
                  range && range.end - 1 === index ? (
                    <ExplainerAskButton
                      anchor={anchorFor(range)}
                      className="ml-auto"
                      label={
                        range.end - range.start === 1 ? "Ask" : `Ask (${range.end - range.start})`
                      }
                    />
                  ) : null
                }
              />
              <ExplainerAskThreads
                threads={threads.filter((thread) => endsAt(thread, index))}
                className="px-2 py-1.5"
              />
            </Fragment>
          );
        })}
      </div>
      <ExplainerAskThreads
        threads={threads.filter(
          (thread) =>
            thread.anchor.target.kind !== "diffLines" ||
            thread.anchor.target.end - 1 < first ||
            thread.anchor.target.end - 1 >= end,
        )}
        className="border-t border-border/60 px-2 py-1.5"
      />
    </section>
  );
}
