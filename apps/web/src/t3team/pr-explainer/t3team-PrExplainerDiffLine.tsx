import type { T3TeamPrExplainerDiffLine } from "@t3tools/contracts";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "~/lib/utils";

const ROW_TONE = {
  add: "bg-diff-addition/10",
  delete: "bg-diff-deletion/10",
  context: "",
} as const;

const WORD_TONE = {
  add: "rounded-[3px] bg-diff-addition/25 text-diff-addition-foreground",
  delete: "rounded-[3px] bg-diff-deletion/25 text-diff-deletion-foreground line-through",
  context: "",
} as const;

const MARKER = { add: "+", delete: "−", context: " " } as const;

/** The line's text with its changed words marked. Ranges are clamped and may arrive unsorted. */
function renderContent(line: T3TeamPrExplainerDiffLine): ReactNode {
  const ranges = [...(line.highlights ?? [])]
    .map((range) => ({
      start: Math.min(range.start, line.content.length),
      end: Math.min(range.end, line.content.length),
    }))
    .filter((range) => range.end > range.start)
    .toSorted((a, b) => a.start - b.start);
  if (ranges.length === 0 || line.kind === "context") return line.content;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) parts.push(line.content.slice(cursor, range.start));
    parts.push(
      <mark key={range.start} className={WORD_TONE[line.kind]}>
        {line.content.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  parts.push(line.content.slice(cursor));
  return parts;
}

/** One diff line: numbers, the +/− gutter, the text, and its inline note. */
export function PrExplainerDiffLineRow({
  line,
  selected,
  muted,
  askSlot,
  onSelectLine,
}: {
  line: T3TeamPrExplainerDiffLine;
  selected: boolean;
  /** Surrounding context the reader expanded into. */
  muted: boolean;
  askSlot?: ReactNode;
  onSelectLine?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const number = line.newLine ?? line.oldLine;
  const sideLabel = line.kind === "add" ? "added" : line.kind === "delete" ? "removed" : "context";
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "group/line grid grid-cols-[2.25rem_2.25rem_1rem_minmax(0,1fr)] items-start font-mono text-2xs leading-5",
        ROW_TONE[line.kind],
        muted && "opacity-70",
        selected && "bg-primary/10 ring-1 ring-primary/40 ring-inset",
      )}
    >
      {[line.oldLine, line.newLine].map((value, column) => (
        <button
          // oxlint-disable-next-line react/no-array-index-key -- the two fixed number columns
          key={column}
          type="button"
          tabIndex={column === 0 ? -1 : 0}
          disabled={!onSelectLine}
          aria-pressed={selected}
          aria-label={`Select line ${number ?? ""} (${sideLabel})`}
          className="cursor-pointer select-none pr-1.5 text-right tabular-nums text-muted-foreground/70 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline disabled:cursor-default"
          onClick={onSelectLine}
        >
          {value ?? ""}
        </button>
      ))}
      <span
        aria-hidden
        className={cn(
          "select-none text-center",
          line.kind === "add" && "text-diff-addition-foreground",
          line.kind === "delete" && "text-diff-deletion-foreground",
        )}
      >
        {MARKER[line.kind]}
      </span>
      <span className="relative flex min-w-0 flex-wrap items-start gap-x-2 pr-2">
        <span className="sr-only">{sideLabel}: </span>
        <code className="min-w-0 whitespace-pre-wrap break-all">{renderContent(line)}</code>
        {line.annotation ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1 font-sans text-2xs leading-4.5 whitespace-nowrap",
              line.annotation.tone === "warning"
                ? "bg-warning/12 text-warning-foreground"
                : "bg-info/10 text-info-foreground",
            )}
          >
            {line.annotation.tone === "warning" ? (
              <TriangleAlertIcon aria-hidden className="size-3" />
            ) : (
              <InfoIcon aria-hidden className="size-3" />
            )}
            <span className="sr-only">
              {line.annotation.tone === "warning" ? "Check:" : "Note:"}
            </span>
            {line.annotation.text}
          </span>
        ) : null}
        {askSlot}
      </span>
    </div>
  );
}
