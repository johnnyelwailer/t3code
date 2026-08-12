/**
 * Fork-owned section mounted below upstream's AgentsPanel content (see the marked seam in
 * `AgentsPanel.tsx`). Upstream's roster model (`RuntimeSubagent`/`AgentPanelModel`) is derived
 * purely from THIS thread's own activities and has no notion of a separate child thread or a
 * durable workflow run — adapting those into fake roster rows would lose click-to-navigate (rows
 * there are deliberately non-interactive) and the run/thread identity the fork needs to route a
 * click. So this renders its own two small lists instead of forcing fork data through upstream's
 * item shape:
 *
 * 1. Sub-run child threads — threads whose `parentThreadId` is this thread, sourced from the same
 *    `t3team-useChildThreadRelations` relation the Work-lens sidebar uses to hide/roll up child
 *    rows. Clicking one navigates via the same `onOpenThread(projectId, threadId)` callback the
 *    sidebar and inline handoff links already use.
 * 2. Recipe workflow runs launched from this thread — reuses
 *    `deriveT3TeamActiveWorkflowDockItems`, the same derivation backing the active-workflow dock,
 *    so "phase/status" here matches what the dock and the run card already show. Clicking one
 *    scrolls to the run's card via the existing `onOpen` navigation-request plumbing.
 */
import { Route as RouteIcon, Workflow } from "lucide-react";

import { cn } from "~/lib/utils";
import { formatRelativeTime } from "~/t3team/components/t3team-projectSidebarTimeLabels";
import type { T3TeamActiveWorkflowDockItem } from "~/t3team/chat/t3team-activeWorkflowDock";
import type { ProjectThread } from "~/t3team/t3team-types";

const CHILD_STATUS_DOT: Record<ProjectThread["status"], string> = {
  idle: "bg-muted-foreground/50",
  running: "bg-info",
  completed: "bg-success",
  error: "bg-destructive",
};

const CHILD_STATUS_LABEL: Record<ProjectThread["status"], string> = {
  idle: "Idle",
  running: "Running",
  completed: "Completed",
  error: "Error",
};

function SubRunRow({
  thread,
  onOpen,
}: {
  thread: ProjectThread;
  onOpen: (input: { readonly projectId: string; readonly threadId: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen({ projectId: thread.projectId, threadId: thread.id })}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/40"
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", CHILD_STATUS_DOT[thread.status])}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
      <span className="shrink-0 font-mono text-[.7rem] text-muted-foreground/80">
        {CHILD_STATUS_LABEL[thread.status]}
      </span>
      <span className="shrink-0 font-mono text-[.7rem] tabular-nums text-muted-foreground/60">
        {formatRelativeTime(thread.lastMessageAt)}
      </span>
    </button>
  );
}

function WorkflowRunRow({
  item,
  onOpen,
}: {
  item: T3TeamActiveWorkflowDockItem;
  onOpen: (item: T3TeamActiveWorkflowDockItem) => void;
}) {
  const summary =
    item.summaries.length > 2
      ? `${item.summaries.slice(0, 2).join(" · ")} · +${item.summaries.length - 2}`
      : item.summaries.join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full flex-col gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-accent/40"
    >
      <span className="truncate text-sm font-medium">{item.name}</span>
      {summary ? <span className="truncate text-xs text-muted-foreground">{summary}</span> : null}
    </button>
  );
}

/**
 * Renders nothing when the fork has no cross-cutting concept to add — the seam then contributes
 * zero DOM either way and upstream's empty state (or roster) is unaffected.
 */
export function T3TeamAgentsPanelForkSection({
  childThreads,
  onOpenChildThread,
  workflowRuns,
  onOpenWorkflowRun,
}: {
  childThreads: ReadonlyArray<ProjectThread>;
  onOpenChildThread: (input: { readonly projectId: string; readonly threadId: string }) => void;
  workflowRuns: ReadonlyArray<T3TeamActiveWorkflowDockItem>;
  onOpenWorkflowRun: (item: T3TeamActiveWorkflowDockItem) => void;
}) {
  if (childThreads.length === 0 && workflowRuns.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 p-2" data-t3team-agents-panel-fork-section="true">
      {childThreads.length > 0 ? (
        <section>
          <div className="flex items-center gap-1.5 px-1.5 pt-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground">
            <RouteIcon aria-hidden className="size-3" />
            Sub-runs
          </div>
          {childThreads.map((thread) => (
            <SubRunRow key={thread.id} thread={thread} onOpen={onOpenChildThread} />
          ))}
        </section>
      ) : null}
      {workflowRuns.length > 0 ? (
        <section>
          <div className="flex items-center gap-1.5 px-1.5 pt-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground">
            <Workflow aria-hidden className="size-3" />
            Recipe workflows
          </div>
          {workflowRuns.map((item) => (
            <WorkflowRunRow key={item.runId} item={item} onOpen={onOpenWorkflowRun} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
