import type { MouseEvent, ReactNode } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { digestStoryProgress } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { DigestAgentDots } from "~/t3team/t3team-ProjectMyWorkDigestAgentDots";
import { DigestProjectChip, DigestStatusDot } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

/**
 * A story's task progress as a compact fraction plus a 40px track. The fraction is the number
 * that carries the meaning; the track is the glanceable shape of it.
 */
function DigestStoryProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-border">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-success/70"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>
      {done}/{total}
    </span>
  );
}

/**
 * The main-lane group header: the story itself, as a row of its own. Key and title link to the
 * story, status and task progress are derived from the graph, so the header moves when a child
 * lands in Done.
 */
export function DigestStoryGroupHeader({
  story,
  graph,
  nowMs,
  onOpenTicket,
}: {
  story: ProjectTicket;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const progress = digestStoryProgress(graph, story.id);
  const claims = graph.claims.filter((c) => c.ticketId === story.id);
  const onAnchorClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (onOpenTicket) {
      e.preventDefault();
      onOpenTicket(story.id);
    }
  };
  return (
    <div
      className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 bg-muted/40 py-1.5 px-3 text-[12px]"
      onClick={() =>
        onOpenTicket ? onOpenTicket(story.id) : window.open(story.ref.url, "_blank", "noopener")
      }
    >
      <JiraIssueTypeIcon
        issueType={story.issueType}
        issueTypeIconUrl={story.issueTypeIconUrl}
        className="size-3.5 shrink-0"
      />
      <a
        href={story.ref.url}
        className="font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        onClick={onAnchorClick}
      >
        {story.ref.displayId}
      </a>
      <a
        href={story.ref.url}
        className="min-w-0 truncate font-medium hover:underline"
        onClick={onAnchorClick}
      >
        {story.ref.title}
      </a>
      <DigestProjectChip graph={graph} projectId={story.projectId} />
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {progress ? <DigestStoryProgress done={progress.done} total={progress.total} /> : null}
        <DigestAgentDots claims={claims} nowMs={nowMs} />
        <DigestStatusDot status={story.status} />
      </span>
    </div>
  );
}

/**
 * The story's children that are NOT surfaced as full rows above — the "rest of this story" at a
 * glance. Each entry is a compact chip: type icon, linked key, truncated title, status, and the
 * assignee's avatar (viewer keeps the ring), so you can see what the other subtasks and bugs are
 * on and who they're on, without expanding them.
 */
export function DigestOtherChildren({
  items: children,
  viewerName,
}: {
  items: readonly ProjectTicket[];
  viewerName: string;
}) {
  if (children.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 bg-muted/20 px-3 py-1.5">
      {children.map((child) => (
        <a
          key={child.id}
          href={child.ref.url}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border/50 hover:text-foreground hover:ring-border"
          onClick={(e) => e.stopPropagation()}
        >
          <JiraIssueTypeIcon
            issueType={child.issueType}
            issueTypeIconUrl={child.issueTypeIconUrl}
            className="size-3 shrink-0"
          />
          <span className="shrink-0 font-mono text-[10px] leading-none -translate-y-px">
            {child.ref.displayId}
          </span>
          <span className="truncate leading-none -translate-y-px">{child.ref.title}</span>
          <span className="shrink-0 text-[10px] leading-none text-foreground/50 -translate-y-px">
            {child.status}
          </span>
          {child.assignee ? (
            <WorkItemPersonAvatar
              person={{ displayName: child.assignee }}
              size="sm"
              isCurrentUser={child.assignee === viewerName}
            />
          ) : null}
        </a>
      ))}
    </div>
  );
}

/**
 * One story group in the main lane: the story header, then its tasks nested under it. Items
 * without a story parent render flat in a plain panel instead.
 */
export function DigestStoryGroup({
  story,
  graph,
  nowMs,
  otherChildren,
  viewerName,
  onOpenTicket,
  children,
}: {
  story: ProjectTicket | null;
  graph: DigestGraph;
  nowMs: number;
  otherChildren?: readonly ProjectTicket[];
  viewerName: string;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  children: ReactNode;
}) {
  return (
    <T3SurfacePanel tone="muted" className="overflow-hidden">
      {story ? (
        <DigestStoryGroupHeader
          story={story}
          graph={graph}
          nowMs={nowMs}
          onOpenTicket={onOpenTicket}
        />
      ) : null}
      <div className="divide-y divide-border/50">{children}</div>
      {story ? <DigestOtherChildren items={otherChildren ?? []} viewerName={viewerName} /> : null}
    </T3SurfacePanel>
  );
}
