/**
 * Fork-owned section mounted inside upstream's AgentsPanel scroll container (see the marked seam
 * in `AgentsPanel.tsx`). Upstream's roster model (`RuntimeSubagent`/`AgentPanelModel`) is derived
 * purely from THIS thread's own activities and has no notion of a separate child thread or a
 * durable workflow run — adapting those into fake roster rows would lose click-to-navigate (rows
 * there are deliberately non-interactive) and the run/thread identity the fork needs to route a
 * click. So this renders its own two small lists instead of forcing fork data through upstream's
 * item shape:
 *
 * 1. Sub-run child threads — the full descendant tree under this thread, sourced from the same
 *    `t3team-useChildThreadRelations` relation the Work-lens sidebar uses to hide/roll up child
 *    rows. Presentation (status-priority grouping, idle collapsing, indentation) lives in
 *    `t3team-AgentsPanelSubRunTree.tsx`; tree building/ordering in
 *    `t3team-AgentsPanelForkSection.logic.ts`. Clicking a row navigates via the same
 *    `onOpenThread(projectId, threadId)` callback the sidebar and inline handoff links use.
 * 2. Recipe workflow runs launched from this thread — reuses
 *    `deriveT3TeamActiveWorkflowDockItems`, the same derivation backing the active-workflow dock,
 *    so "phase/status" here matches what the dock and the run card already show. Clicking one
 *    scrolls to the run's card via the existing `onOpen` navigation-request plumbing.
 */
import { Route as RouteIcon, Workflow } from "lucide-react";

import type { T3TeamActiveWorkflowDockItem } from "~/t3team/chat/t3team-activeWorkflowDock";
import type { ProjectThread } from "~/t3team/t3team-types";
import { buildSubRunTree, type SubRunOpenCallback } from "./t3team-AgentsPanelForkSection.logic";
import { T3TeamAgentsPanelSubRunTree } from "./t3team-AgentsPanelSubRunTree";

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
  childThreadsByParentId,
  rootThreadId,
  onOpenChildThread,
  workflowRuns,
  onOpenWorkflowRun,
}: {
  childThreadsByParentId: ReadonlyMap<string, ReadonlyArray<ProjectThread>>;
  rootThreadId: string | null;
  onOpenChildThread: SubRunOpenCallback;
  workflowRuns: ReadonlyArray<T3TeamActiveWorkflowDockItem>;
  onOpenWorkflowRun: (item: T3TeamActiveWorkflowDockItem) => void;
}) {
  const subRunTree =
    rootThreadId !== null ? buildSubRunTree(rootThreadId, childThreadsByParentId) : [];

  if (subRunTree.length === 0 && workflowRuns.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 p-2" data-t3team-agents-panel-fork-section="true">
      {subRunTree.length > 0 ? (
        <section>
          <div className="flex items-center gap-1.5 px-1.5 pt-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground">
            <RouteIcon aria-hidden className="size-3" />
            Sub-runs
          </div>
          <T3TeamAgentsPanelSubRunTree nodes={subRunTree} onOpen={onOpenChildThread} />
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
