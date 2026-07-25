import type { ReactNode } from "react";

import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { cn } from "~/t3team/lib/t3team-utils";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { useWorkItemLayoutMode } from "~/t3team/workitem/t3team-useWorkItemLayoutMode";

/**
 * Zone shell for the work item detail view.
 *
 * Sizing keys off the view's own width, not the viewport, because this view lives inside a
 * resizable pane (`t3team-ResizableRightSidebarLayout.tsx`) — a viewport media query would claim
 * "desktop" while the content actually has 400px because the agent panel is open.
 *
 * Progression:
 * - `narrow`/`regular` — one column. Properties collapse into a "Details" section placed *after*
 *   the description: the description is what the reader came for, and sixteen property rows above
 *   it would push it off a phone screen entirely. Status stays visible in the title band, so
 *   nothing essential is hidden by the collapse.
 * - `wide` — content plus a properties rail, expanded.
 * - `ultra` — description and discussion read side by side, so a wide display shows the item and
 *   its conversation at once instead of stretching one column across it.
 */
export function WorkItemDetailLayout({
  titleBand,
  properties,
  primary,
  discussion,
  className,
}: {
  readonly titleBand: ReactNode;
  readonly properties: ReactNode;
  readonly primary: ReactNode;
  readonly discussion: ReactNode;
  readonly className?: string;
}) {
  const { mode, containerRef } = useWorkItemLayoutMode();
  const hasRail = mode === "wide" || mode === "ultra";

  /*
    The container is this element, not the window and not the page: the detail header sits above
    both this column and the agent panel, so only the column's own width tells us how much room the
    content has.
  */
  return (
    <div
      ref={containerRef}
      className={cn("@container/workitem flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-5 px-4 py-5 @2xl/workitem:px-6 @2xl/workitem:py-6">
          {titleBand}

          {hasRail ? (
            <div className="grid min-w-0 items-start gap-5 @4xl/workitem:grid-cols-[minmax(0,1fr)_17rem] @6xl/workitem:grid-cols-[minmax(0,1fr)_19rem] @6xl/workitem:gap-6">
              <div className={cn("grid min-w-0 gap-5", mode === "ultra" && "grid-cols-2 gap-6")}>
                <div className="flex min-w-0 flex-col gap-5">{primary}</div>
                <div className="flex min-w-0 flex-col gap-5">{discussion}</div>
              </div>

              <aside className="min-w-0 border-t border-border/60 pt-4 @4xl/workitem:border-t-0 @4xl/workitem:pt-0">
                {properties}
              </aside>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-5">
              {primary}
              <WorkItemSection title="Details" collapsible defaultCollapsed>
                <div className="rounded-lg border border-border/70 bg-card/40 p-3.5">
                  {properties}
                </div>
              </WorkItemSection>
              {discussion}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
