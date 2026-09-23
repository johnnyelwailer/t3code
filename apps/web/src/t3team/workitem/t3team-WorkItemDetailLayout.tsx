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
 * The description is the only block with unbounded length: some projects write thousands of words,
 * which would push the reference sections off the bottom of the page. So from 72rem the view splits
 * into two columns. The description and the conversation (comments) stay together on the left — the
 * two things a reader works through — while the bounded reference material (child items, links,
 * files) sits on the right. Below the split width there is a single column, and the sticky section
 * nav keeps everything one click away instead.
 */
export function WorkItemDetailLayout({
  titleBand,
  sectionNav,
  properties,
  primary,
  secondary,
  className,
}: {
  readonly titleBand: ReactNode;
  readonly sectionNav: ReactNode;
  readonly properties: ReactNode;
  /** The description and the conversation (comments): the left column at the split. */
  readonly primary: ReactNode;
  /** Child items, links, attachments, supplemental: the bounded reference lane, right at the split. */
  readonly secondary: ReactNode;
  readonly className?: string;
}) {
  const { mode, containerRef } = useWorkItemLayoutMode();
  const hasRail = mode === "wide" || mode === "ultra";
  const isSplit = mode === "ultra";

  return (
    <div
      ref={containerRef}
      className={cn("@container/workitem flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-5 px-4 py-5 @2xl/workitem:px-6 @2xl/workitem:py-6">
          {titleBand}
          {isSplit ? null : sectionNav}

          {hasRail ? (
            <div className="grid min-w-0 items-start gap-5 @4xl/workitem:grid-cols-[minmax(0,1fr)_17rem] @6xl/workitem:grid-cols-[minmax(0,1fr)_19rem] @6xl/workitem:gap-6">
              <div className={cn("grid min-w-0 gap-5", isSplit && "grid-cols-2 gap-6")}>
                {/* Left: description + conversation. Right: the bounded reference lane. */}
                <div className="flex min-w-0 flex-col gap-5">{primary}</div>
                <div className="flex min-w-0 flex-col gap-5">{secondary}</div>
              </div>

              <aside className="min-w-0 border-t border-border/60 pt-4 @4xl/workitem:border-t-0 @4xl/workitem:pt-0">
                {properties}
              </aside>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-5">
              {primary}
              {/*
                Open by default. Collapsing it hid fields people came to read and made the answer to
                a simple question a click away; the section nav already exists for anyone who wants
                to skip past it, and it stays collapsible for anyone who does.
              */}
              <WorkItemSection title="Details" collapsible>
                <div className="rounded-lg border border-border/70 bg-card/40 p-3.5">
                  {properties}
                </div>
              </WorkItemSection>
              {secondary}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
