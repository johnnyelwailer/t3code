/**
 * The sub-run tree for the t3team Agents panel (see `t3team-AgentsPanelForkSection.tsx`):
 * compact single-line rows, status-priority order, idle threads collapsed into one
 * "N idle · expand" disclosure row, nested sub-runs indented + collapsible.
 * Tree building/ordering live in `t3team-AgentsPanelForkSection.logic.ts`.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { formatRelativeTime } from "~/t3team/components/t3team-projectSidebarTimeLabels";
import type { ProjectThread } from "~/t3team/t3team-types";
import {
  sortSubRunNodes,
  type SubRunNode,
  type SubRunOpenCallback,
} from "./t3team-AgentsPanelForkSection.logic";

const CHILD_STATUS: Record<ProjectThread["status"], { dot: string; label: string }> = {
  idle: { dot: "bg-muted-foreground/50", label: "Idle" },
  running: { dot: "bg-info", label: "Running" },
  completed: { dot: "bg-success", label: "Completed" },
  error: { dot: "bg-destructive", label: "Error" },
};

const INDENT_CLASS = "ml-3 border-l border-border/40 pl-2";

/**
 * How many non-idle sub-runs render at once before a "Show more" disclosure. A coordinator with
 * many children (dozens of sub-runs) would otherwise render every row on expand; the user only
 * wants the most recent active ones up front. Idle threads are unaffected — they collapse into
 * their own disclosure regardless of this limit.
 */
const VISIBLE_SUB_RUN_LIMIT = 10;

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return open ? (
    <ChevronDown aria-hidden className={cn("size-3 text-muted-foreground/60", className)} />
  ) : (
    <ChevronRight aria-hidden className={cn("size-3 text-muted-foreground/60", className)} />
  );
}

function SubRunRow({
  thread,
  hasChildren = false,
  open = false,
  onToggle,
  onOpen,
}: {
  thread: ProjectThread;
  hasChildren?: boolean;
  open?: boolean;
  onToggle?: (() => void) | undefined;
  onOpen: SubRunOpenCallback;
}) {
  return (
    <div className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent/40">
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse sub-runs" : "Expand sub-runs"}
          className="shrink-0 rounded-sm p-0.5 hover:bg-accent/60"
        >
          <Chevron open={open} />
        </button>
      ) : (
        <span aria-hidden className="size-3 shrink-0" />
      )}
      <button
        type="button"
        onClick={() => onOpen({ projectId: thread.projectId, threadId: thread.id })}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", CHILD_STATUS[thread.status].dot)}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
        <span className="shrink-0 font-mono text-[.7rem] text-muted-foreground/80">
          {CHILD_STATUS[thread.status].label}
        </span>
        <span className="shrink-0 font-mono text-[.7rem] tabular-nums text-muted-foreground/60">
          {formatRelativeTime(thread.lastMessageAt)}
        </span>
      </button>
    </div>
  );
}

/** One sub-run plus its (collapsible, indented) subtree. */
function SubRunNodeView({ node, onOpen }: { node: SubRunNode; onOpen: SubRunOpenCallback }) {
  const [open, setOpen] = useState(node.thread.status === "running");
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <SubRunRow
        thread={node.thread}
        hasChildren={hasChildren}
        open={open}
        onToggle={hasChildren ? () => setOpen((value) => !value) : undefined}
        onOpen={onOpen}
      />
      {hasChildren && open ? (
        <div className={INDENT_CLASS}>
          <SubRunChildrenGroup nodes={node.children} onOpen={onOpen} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Status-priority grouping for one level: working -> errors -> recent (settled), with every
 * idle thread at this level collapsed into a single disclosure row instead of cluttering the
 * list.
 */
function SubRunChildrenGroup({
  nodes,
  onOpen,
}: {
  nodes: ReadonlyArray<SubRunNode>;
  onOpen: SubRunOpenCallback;
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = sortSubRunNodes(nodes);
  const idleNodes = sorted.filter((node) => node.thread.status === "idle");
  const activeNodes = sorted.filter((node) => node.thread.status !== "idle");
  // Newest-to-oldest (see sortSubRunNodes); render only the most recent VISIBLE_SUB_RUN_LIMIT
  // up front, with a "Show more" disclosure for the rest so a large fleet never floods the panel.
  const visibleActive = showAll ? activeNodes : activeNodes.slice(0, VISIBLE_SUB_RUN_LIMIT);
  const hiddenCount = activeNodes.length - visibleActive.length;
  return (
    <div className="flex flex-col">
      {visibleActive.map((node) => (
        <SubRunNodeView key={node.thread.id} node={node} onOpen={onOpen} />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          aria-expanded={false}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent/40"
        >
          <ChevronRight aria-hidden className="size-3 shrink-0" />
          <span>Show {hiddenCount} more</span>
        </button>
      ) : null}
      {idleNodes.length > 0 ? <IdleSubRunDisclosure nodes={idleNodes} onOpen={onOpen} /> : null}
    </div>
  );
}

/** "N idle · expand" disclosure row for the stale threads of one level. */
function IdleSubRunDisclosure({
  nodes,
  onOpen,
}: {
  nodes: ReadonlyArray<SubRunNode>;
  onOpen: SubRunOpenCallback;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent/40"
      >
        <Chevron open={open} className="shrink-0" />
        <span>
          {nodes.length} idle · {open ? "collapse" : "expand"}
        </span>
      </button>
      {open ? (
        <div className={INDENT_CLASS}>
          <div className="flex flex-col">
            {nodes.map((node) => (
              <SubRunNodeView key={node.thread.id} node={node} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The full sub-run tree under one root thread. */
export function T3TeamAgentsPanelSubRunTree({
  nodes,
  onOpen,
}: {
  nodes: ReadonlyArray<SubRunNode>;
  onOpen: SubRunOpenCallback;
}) {
  return <SubRunChildrenGroup nodes={nodes} onOpen={onOpen} />;
}
