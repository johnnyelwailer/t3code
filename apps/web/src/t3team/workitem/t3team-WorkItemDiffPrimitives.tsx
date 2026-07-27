import { MessageSquarePlus } from "lucide-react";

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
  /** Carries a reader's anchored comment. Composes with `kind` — you comment on inserted text. */
  readonly commented?: boolean;
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
        /*
          A comment mark has to read differently from a diff mark or the reader cannot tell what the
          agent changed from what a colleague questioned. Diff marks are fills; a comment is a dotted
          underline, so the two stack legibly on the same words.
        */
        const commented = segment.commented
          ? "underline decoration-primary decoration-dotted decoration-2 underline-offset-[3px]"
          : undefined;

        if (segment.kind === "del") {
          return (
            <del
              key={key}
              className={cn(
                "mx-px rounded-[3px] bg-destructive/10 px-1 text-muted-foreground decoration-destructive/60",
                commented,
              )}
            >
              {segment.text}
            </del>
          );
        }

        if (segment.kind === "add") {
          /* Tint, not coloured text — body copy has to stay as readable as the rest. */
          return (
            <mark
              key={key}
              className={cn("mx-px rounded-[3px] bg-success/15 px-1 text-foreground", commented)}
            >
              {segment.text}
            </mark>
          );
        }

        return (
          <span key={key} className={commented}>
            {segment.text}
          </span>
        );
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

/**
 * Overlay chrome for a node that cannot be diffed by eye — media, mostly.
 *
 * Deliberately not an inline pill. A pill sitting under an image reads as a caption, and this
 * document also contains real Jira status lozenges, which *are* content: two pill-shaped things
 * next to each other, one describing the document and one part of it. An overlay corner ribbon
 * cannot be mistaken for either.
 */
export function T3TeamDiffRibbon({
  kind,
  children,
}: {
  readonly kind: T3TeamDiffBlockKind;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute left-0 top-0 z-10 rounded-br-md rounded-tl-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background",
        kind === "add" && "bg-success",
        kind === "del" && "bg-destructive",
        kind === "edit" && "bg-primary",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The rail everything the *review* says lives in — change markers and the comment affordance.
 *
 * Keeping it in a reserved column, outside the text, is what lets a reader tell the document from
 * the commentary on it at a glance. Nothing here is content.
 */
export function T3TeamDiffGutter({
  state,
  commentCount = 0,
  onComment,
}: {
  readonly state?: T3TeamDiffBlockKind | undefined;
  readonly commentCount?: number;
  readonly onComment?: () => void;
}) {
  const marker = state === "add" ? "+" : state === "del" ? "−" : state === "edit" ? "~" : "";

  return (
    <div className="flex w-9 shrink-0 select-none items-start justify-end gap-1 pt-0.5 pr-1.5">
      {commentCount > 0 ? (
        <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {commentCount}
        </span>
      ) : onComment ? (
        <button
          type="button"
          aria-label="Comment on this block"
          onClick={onComment}
          className="flex size-4 cursor-pointer items-center justify-center rounded-[3px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <MessageSquarePlus className="size-3.5" />
        </button>
      ) : null}

      <span
        aria-hidden={marker === ""}
        className={cn(
          "w-2 text-right font-mono text-xs leading-6",
          state === "add" && "text-success-foreground",
          state === "del" && "text-destructive",
          state === "edit" && "text-primary",
        )}
      >
        {marker}
      </span>
    </div>
  );
}
