import type { T3TeamPrExplainerAnchor, T3TeamPrExplainerDiffSlice } from "@t3tools/contracts";
import { ChevronsDownUpIcon, ChevronsUpDownIcon, CodeIcon } from "lucide-react";
import { Fragment, useState } from "react";

import { Button } from "~/components/ui/button";

import { prExplainerSliceLines } from "./t3team-prExplainerAnchor";
import type { PrExplainerOpenInCodeTarget } from "./t3team-prExplainerAskContext";
import { PrExplainerAskButton } from "./t3team-PrExplainerAskCard";
import { PrExplainerAskThreads, usePrExplainerSectionThreads } from "./t3team-PrExplainerAskThread";
import { PrExplainerDiffLineRow } from "./t3team-PrExplainerDiffLine";

const STATUS_LABEL = { added: "new", deleted: "deleted", renamed: "renamed", modified: null };

interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** A 2–5 line slice of one file's diff: expandable context, line-range Ask, open in Code. */
export function PrExplainerDiffSlice({
  stepId,
  slice,
  onOpenInCode,
}: {
  stepId: string;
  slice: T3TeamPrExplainerDiffSlice;
  onOpenInCode?: ((target: PrExplainerOpenInCodeTarget) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<LineRange | null>(null);
  const { all, focusStart, focusEnd } = prExplainerSliceLines(slice);
  const canExpand = all.length > slice.lines.length;
  const first = expanded ? 0 : focusStart;
  const last = expanded ? all.length - 1 : focusEnd;
  const threads = usePrExplainerSectionThreads(stepId, `diff:${slice.id}`);
  const name = slice.path.split("/").at(-1) ?? slice.path;
  const dir = slice.path.slice(0, slice.path.length - name.length);
  const status = STATUS_LABEL[slice.status];
  const firstChanged = slice.lines.find((line) => line.kind !== "context") ?? slice.lines[0];

  const select = (index: number, extend: boolean) => {
    setRange((current) => {
      if (extend && current) {
        return { start: Math.min(current.start, index), end: Math.max(current.end, index) };
      }
      return current && current.start === index && current.end === index
        ? null
        : { start: index, end: index };
    });
  };

  const anchorFor = (lineRange: LineRange): T3TeamPrExplainerAnchor => ({
    stepId,
    target: { kind: "diffLine", sliceId: slice.id, ...lineRange },
    quote: all
      .slice(lineRange.start, lineRange.end + 1)
      .map((line) => line.content)
      .join("\n"),
  });

  return (
    <section
      aria-label={`Changes in ${slice.path}`}
      className="overflow-hidden rounded-lg border border-border bg-card"
      data-pxp-section="diff"
      data-pxp-slice={slice.id}
    >
      <header className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 py-1 pr-1 pl-2.5">
        <div className="min-w-0 flex-1 truncate font-mono text-2xs">
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium text-foreground">{name}</span>
        </div>
        {status ? (
          <span className="rounded-sm bg-success/12 px-1 text-2xs text-success-foreground">
            {status}
          </span>
        ) : null}
        {slice.additions !== undefined || slice.deletions !== undefined ? (
          <span className="font-mono text-2xs tabular-nums">
            {slice.additions ? (
              <span className="text-diff-addition-foreground">+{slice.additions}</span>
            ) : null}
            {slice.deletions ? (
              <span className="ml-1 text-diff-deletion-foreground">−{slice.deletions}</span>
            ) : null}
          </span>
        ) : null}
        {canExpand ? (
          <Button
            variant="ghost-muted"
            size="icon-micro"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide surrounding lines" : "Show surrounding lines"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
          </Button>
        ) : null}
        {onOpenInCode && firstChanged ? (
          <Button
            variant="ghost-muted"
            size="micro"
            aria-label={`Open ${name} in Code`}
            onClick={() =>
              onOpenInCode({
                path: slice.path,
                line: firstChanged.newLine ?? firstChanged.oldLine ?? slice.hunk.newStart,
                side: firstChanged.newLine === null ? "old" : "new",
              })
            }
          >
            <CodeIcon />
            Code
          </Button>
        ) : null}
      </header>
      <div className="py-1">
        {canExpand && !expanded && focusStart > 0 ? (
          <HunkHeader slice={slice} onExpand={() => setExpanded(true)} />
        ) : null}
        {all.slice(first, last + 1).map((line, offset) => {
          const index = first + offset;
          const selected = range !== null && index >= range.start && index <= range.end;
          const lineThreads = threads.filter(
            (thread) =>
              thread.anchor.target.kind === "diffLine" && thread.anchor.target.end === index,
          );
          return (
            <Fragment key={index}>
              <PrExplainerDiffLineRow
                line={line}
                selected={selected}
                muted={index < focusStart || index > focusEnd}
                onSelectLine={(event) => select(index, event.shiftKey)}
                askSlot={
                  range && range.end === index ? (
                    <PrExplainerAskButton
                      anchor={anchorFor(range)}
                      className="ml-auto"
                      label={
                        range.start === range.end ? "Ask" : `Ask (${range.end - range.start + 1})`
                      }
                    />
                  ) : null
                }
              />
              <PrExplainerAskThreads threads={lineThreads} className="px-2 py-1.5" />
            </Fragment>
          );
        })}
      </div>
      <PrExplainerAskThreads
        threads={threads.filter(
          (thread) =>
            thread.anchor.target.kind !== "diffLine" ||
            thread.anchor.target.end < first ||
            thread.anchor.target.end > last,
        )}
        className="border-t border-border/60 px-2 py-1.5"
      />
    </section>
  );
}

function HunkHeader({
  slice,
  onExpand,
}: {
  slice: T3TeamPrExplainerDiffSlice;
  onExpand: () => void;
}) {
  const { oldStart, oldLines, newStart, newLines } = slice.hunk;
  return (
    <button
      type="button"
      onClick={onExpand}
      className="block w-full px-2 text-left font-mono text-2xs leading-5 text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground"
    >
      @@ −{oldStart},{oldLines} +{newStart},{newLines} @@
    </button>
  );
}
