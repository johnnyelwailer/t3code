import { useCallback } from "react";

import { cn } from "~/t3team/lib/t3team-utils";

export type WorkItemSectionNavEntry = {
  readonly anchorId: string;
  readonly label: string;
  readonly count?: number | undefined;
};

/**
 * Jumps to a section without scrolling through the description.
 *
 * A description has no length limit, so on a narrow column everything after it is out of reach and,
 * worse, invisible — you cannot tell an item has eight child issues or a live discussion without
 * scrolling past an essay first. This turns that into one click, and the counts alone answer "is
 * there anything down there" without any navigation at all.
 *
 * Only rendered where the two-column layout is not available. Above that width the sections sit
 * beside the description, so there is nothing to jump past and a nav would be noise.
 */
export function WorkItemSectionNav({
  entries,
  className,
}: {
  readonly entries: ReadonlyArray<WorkItemSectionNavEntry>;
  readonly className?: string;
}) {
  const jumpTo = useCallback((anchorId: string) => {
    const target = document.getElementById(anchorId);
    if (!target) return;
    // `smooth` respects prefers-reduced-motion at the platform level.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // A single section is the description itself; there is nothing to navigate between.
  if (entries.length < 2) return null;

  return (
    <nav
      aria-label="Sections"
      className={cn(
        "sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto px-1 py-1.5",
        "bg-background/85 backdrop-blur-sm",
        // The row scrolls sideways on a phone rather than wrapping into a second line of chrome.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {entries.map((entry) => (
        <button
          key={entry.anchorId}
          type="button"
          onClick={() => jumpTo(entry.anchorId)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {entry.label}
          {entry.count !== undefined && entry.count > 0 ? (
            <span className="tabular-nums text-foreground/70">{entry.count}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
