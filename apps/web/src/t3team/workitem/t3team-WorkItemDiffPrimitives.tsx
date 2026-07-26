import { cn } from "~/t3team/lib/t3team-utils";

/**
 * The marks a proposed-document review is drawn with.
 *
 * One rule underpins all of it: **diff each node at its own granularity.** Prose diffs by word, a
 * table by cell, a code block by line, an image not at all — it either changed or it did not.
 * Flattening everything to text lines, which is what a `+`/`-` patch view does, is what makes a
 * reflowed paragraph look like a total rewrite and a one-cell table edit look like a new table.
 */

export type T3TeamDiffSegmentKind = "add" | "del";

export type T3TeamDiffSegment = {
  readonly text: string;
  readonly kind?: T3TeamDiffSegmentKind;
};

export type T3TeamDiffBlockKind = "add" | "del" | "edit";

/**
 * Word-level marks inside a run of prose.
 *
 * A replacement is a deletion immediately followed by an insertion, so the two need horizontal
 * padding or they collide into "shouldmust" at exactly the spot being judged.
 */
export function T3TeamDiffText({
  segments,
}: {
  readonly segments: ReadonlyArray<T3TeamDiffSegment>;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.kind ?? "same"}:${index}:${segment.text}`;

        if (segment.kind === "del") {
          return (
            <del
              key={key}
              className="mx-px rounded-[3px] bg-destructive/10 px-1 text-muted-foreground decoration-destructive/60"
            >
              {segment.text}
            </del>
          );
        }

        if (segment.kind === "add") {
          /* Tint, not coloured text — body copy has to stay as readable as the rest. */
          return (
            <mark key={key} className="mx-px rounded-[3px] bg-success/15 px-1 text-foreground">
              {segment.text}
            </mark>
          );
        }

        return <span key={key}>{segment.text}</span>;
      })}
    </>
  );
}

/**
 * Gutter marking for a block that was added, removed or edited. Sits in the margin so the content
 * keeps its own indentation and a nested block still lines up with its siblings.
 */
export function T3TeamDiffBlock({
  kind,
  className,
  children,
}: {
  readonly kind?: T3TeamDiffBlockKind | undefined;
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "-ml-3 border-l-2 py-0.5 pl-[calc(0.75rem-2px)]",
        kind === "add" && "border-success/60 bg-success/5",
        kind === "del" && "border-destructive/60 bg-destructive/5",
        kind === "edit" && "border-primary/50",
        kind === undefined && "border-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A short label naming what happened to a node the reader cannot diff by eye. */
export function T3TeamDiffTag({
  kind,
  children,
}: {
  readonly kind: T3TeamDiffBlockKind;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium",
        kind === "add" && "bg-success/15 text-success-foreground",
        kind === "del" && "bg-destructive/10 text-destructive",
        kind === "edit" && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  );
}
