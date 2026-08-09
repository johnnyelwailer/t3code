import { useCallback } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { cn } from "~/t3team/lib/t3team-utils";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import {
  countWorkItemDraftsPending,
  useWorkItemDrafts,
} from "~/t3team/workitem/t3team-useWorkItemDrafts";
import type { WorkItemFieldMutations } from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import { WorkItemDraftStripMount } from "~/t3team/workitem/t3team-WorkItemDraftStripMount";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

export type WorkItemSectionNavEntry = {
  readonly anchorId: string;
  readonly label: string;
  readonly count?: number | undefined;
};

type DraftStripProps = {
  readonly issueIdOrKey: string;
  readonly projectId: string;
  readonly model: WorkItemFieldModel;
  readonly mutations: WorkItemFieldMutations;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload: () => void;
  readonly descriptionCurrentText?: string | undefined;
  readonly onReviewDescription: () => void;
  readonly onReviewComments: () => void;
};

/**
 * Jumps to a section without scrolling through the description, and — the other entry point to the
 * one shared draft strip — the "N proposed" pill, docked directly under this bar and NOT sticky, so
 * it scrolls away with the content while this nav stays pinned.
 *
 * A description has no length limit, so on a narrow column everything after it is out of reach and,
 * worse, invisible — you cannot tell an item has eight child issues or a live discussion without
 * scrolling past an essay first. This turns that into one click, and the counts alone answer "is
 * there anything down there" without any navigation at all.
 */
export function WorkItemSectionNav({
  entries,
  draftStrip,
  className,
}: {
  readonly entries: ReadonlyArray<WorkItemSectionNavEntry>;
  readonly draftStrip: DraftStripProps;
  readonly className?: string;
}) {
  const jumpTo = useCallback((anchorId: string) => {
    const target = document.getElementById(anchorId);
    if (!target) return;
    // `smooth` respects prefers-reduced-motion at the platform level.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const draftsByField = useWorkItemDrafts({
    projectId: draftStrip.projectId,
    issueIdOrKey: draftStrip.issueIdOrKey,
  });
  const draftCount = countWorkItemDraftsPending(draftsByField);
  const toggleStrip = useWorkItemDraftReviewUiStore((state) => state.toggleStrip);
  const hasDrafts = draftCount > 0;

  // A single section is the description itself; there is nothing to navigate between — unless a
  // draft pill still needs somewhere to show.
  if (entries.length < 2 && !hasDrafts) return null;

  return (
    <>
      <nav
        aria-label="Sections"
        className={cn(
          "sticky top-0 z-10 flex gap-1 overflow-x-auto py-2",
          /*
            Full-bleed: the negative margins cancel the scroll container's own padding and the padding
            is added back inside, so the backdrop spans the full width. Previously it stopped short of
            both edges and content scrolled past in the gap, which read as a floating black band.
          */
          "-mx-4 px-4 @2xl/workitem:-mx-6 @2xl/workitem:px-6",
          // Opaque enough to hide content passing underneath, with a border so it reads as chrome.
          "border-b border-border/60 bg-background/95 backdrop-blur",
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
        {hasDrafts ? (
          <button
            type="button"
            onClick={() => toggleStrip(draftStrip.issueIdOrKey)}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-dashed border-primary/60 bg-primary/5 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {draftCount} proposed
          </button>
        ) : null}
      </nav>
      {/* Not sticky, deliberately: it docks right under the bar above but scrolls away with the rest. */}
      <WorkItemDraftStripMount {...draftStrip} />
    </>
  );
}
