import type { MouseEvent, ReactNode } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { digestStoryProgress } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestStoryAdjacency } from "~/t3team/t3team-projectMyWorkDigestAdjacency";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { DigestAdjacentWork } from "~/t3team/t3team-ProjectMyWorkDigestAdjacentPills";
import { DigestAgentDots } from "~/t3team/t3team-ProjectMyWorkDigestAgentDots";
import { DigestProjectChip, DigestStatusDot } from "~/t3team/t3team-ProjectMyWorkDigestRows";

/**
 * A story's task progress as a compact fraction plus a 40px track. The fraction is the number
 * that carries the meaning; the track is the glanceable shape of it.
 */
function DigestStoryProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs tabular-nums text-muted-foreground">
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
      className="flex min-w-0 cursor-pointer flex-nowrap items-center gap-2 overflow-hidden border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs"
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
        className="shrink-0 font-mono text-2xs text-muted-foreground hover:text-foreground hover:underline"
        onClick={onAnchorClick}
      >
        {story.ref.displayId}
      </a>
      <a
        href={story.ref.url}
        className="min-w-0 flex-1 truncate font-medium hover:underline"
        onClick={onAnchorClick}
      >
        {story.ref.title}
      </a>
      <DigestProjectChip graph={graph} projectId={story.projectId} />
      <span className="flex shrink-0 items-center gap-2">
        {progress ? <DigestStoryProgress done={progress.done} total={progress.total} /> : null}
        <DigestAgentDots claims={claims} nowMs={nowMs} />
        <DigestStatusDot status={story.status} />
      </span>
    </div>
  );
}

/**
 * One story group in the main lane, in three tiers of attention: the story header and the
 * viewer's own rows at full weight, then adjacent active work as pills, then the rest as one
 * count. Items without a story parent render flat in a plain panel instead.
 */
export function DigestStoryGroup({
  story,
  graph,
  nowMs,
  adjacency,
  onOpenTicket,
  children,
}: {
  story: ProjectTicket | null;
  graph: DigestGraph;
  nowMs: number;
  adjacency?: DigestStoryAdjacency | undefined;
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
      {story && adjacency ? (
        <DigestAdjacentWork adjacency={adjacency} onOpenTicket={onOpenTicket} />
      ) : null}
    </T3SurfacePanel>
  );
}
