import { InfoIcon, TriangleAlertIcon, cn } from "./t3team-explainerHostKit";
import type { MouseEvent, ReactNode } from "react";

import type { ExplainerNumberedLine } from "./t3team-explainerDiffLines";
import { ExplainerHighlighted } from "./t3team-ExplainerHighlighted";

const ROW_TONE = {
  add: "bg-diff-addition/10",
  delete: "bg-diff-deletion/10",
  context: "",
} as const;
const WORD_TONE = { add: "add", delete: "delete", context: "neutral" } as const;
const MARKER = { add: "+", delete: "−", context: " " } as const;
const SIDE = { add: "added", delete: "removed", context: "context" } as const;

/** Notes are a few words; a long one is cut here rather than rejected upstream. */
const NOTE_MAX = 80;

/** One diff line: one gutter button with both numbers, the +/− marker, the text, its note. */
export function ExplainerDiffLineRow({
  entry,
  selected,
  muted,
  askSlot,
  onSelectLine,
}: {
  entry: ExplainerNumberedLine;
  selected: boolean;
  /** Surrounding context the reader expanded into. */
  muted: boolean;
  askSlot?: ReactNode;
  onSelectLine?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { line } = entry;
  const number = entry.newLine ?? entry.oldLine;
  const note = line.annotation;
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] items-start font-mono text-2xs leading-5",
        ROW_TONE[line.kind],
        muted && "opacity-70",
        selected && "bg-primary/10 ring-1 ring-primary/40 ring-inset",
      )}
    >
      <button
        type="button"
        disabled={!onSelectLine}
        aria-pressed={selected}
        aria-label={`Select line ${number ?? ""} (${SIDE[line.kind]})`}
        className="grid cursor-pointer select-none grid-cols-2 pr-1.5 text-right tabular-nums text-muted-foreground/70 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline disabled:cursor-default"
        onClick={onSelectLine}
      >
        <span>{entry.oldLine ?? ""}</span>
        <span>{entry.newLine ?? ""}</span>
      </button>
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
        <span className="sr-only">{SIDE[line.kind]}: </span>
        <code className="min-w-0 whitespace-pre-wrap break-all">
          <ExplainerHighlighted
            text={line.content}
            words={line.highlight}
            tone={WORD_TONE[line.kind]}
          />
        </code>
        {note ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1 font-sans text-2xs leading-4.5 whitespace-nowrap",
              note.tone === "warning"
                ? "bg-warning/12 text-warning-foreground"
                : "bg-info/10 text-info-foreground",
            )}
          >
            {note.tone === "warning" ? (
              <TriangleAlertIcon aria-hidden className="size-3" />
            ) : (
              <InfoIcon aria-hidden className="size-3" />
            )}
            <span className="sr-only">{note.tone === "warning" ? "Check:" : "Note:"}</span>
            <span className="sr-only">{note.text}</span>
            <span aria-hidden>
              {note.text.length > NOTE_MAX ? `${note.text.slice(0, NOTE_MAX)}…` : note.text}
            </span>
          </span>
        ) : null}
        {askSlot}
      </span>
    </div>
  );
}
