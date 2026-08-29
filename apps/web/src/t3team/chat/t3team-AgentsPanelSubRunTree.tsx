/**
 * The sub-run tree for the t3team Agents panel (see `t3team-AgentsPanelForkSection.tsx`):
 * compact single-line rows, status-priority order, idle threads collapsed into one
 * "N idle · expand" disclosure row, nested sub-runs indented + collapsible.
 * Tree building/ordering live in `t3team-AgentsPanelForkSection.logic.ts`.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { usePrimarySettings } from "~/hooks/useSettings";
import { formatRelativeTime } from "~/t3team/components/t3team-projectSidebarTimeLabels";
import type { ProjectThread } from "~/t3team/t3team-types";
import {
  partitionSubRunThreads,
  sortFoldedSubRunThreads,
} from "~/t3team/components/t3team-projectSidebarThreadTree";
import {
  resolveSubRunStatusLabel,
  sortSubRunNodes,
  type SubRunNode,
  type SubRunOpenCallback,
} from "./t3team-AgentsPanelForkSection.logic";
import { SubRunStatusIcon } from "./t3team-AgentsPanelSubRunStatusIcon";

const INDENT_CLASS = "ml-3 border-l border-border/40 pl-2";

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
  // GHE #208 seam: the row's status TEXT goes through the SAME shared resolution as the
  // sidebar sub-run rows (LLM label → state word → stable label); the dot/icon keep
  // their own 4-state + settled visuals untouched.
  const activityLabelsEnabled = usePrimarySettings(
    (settings) => settings.t3teamActivityLabelsEnabled,
  );
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
        <SubRunStatusIcon status={thread.status} />
        <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
        <span className="shrink-0 font-mono text-[.7rem] text-muted-foreground/80">
          {resolveSubRunStatusLabel(thread, { activityLabelsEnabled })}
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
 * GHE #304 — one level of the sub-run roster: the visible list shows ONLY
 * running sub-runs (the "Active" area — a terminal thread from hours or days
 * ago is roster noise, and the settled override settles it out of rosters
 * for good); every non-running sub-run collapses into ONE dim fold row,
 * replacing the old "N idle · expand" disclosure. Expanding lists the
 * folded sub-runs with their terminal-state glyph + age — no per-thread
 * chrome — in oldest-first order (the server cleanup-nudge digest order).
 */
function SubRunChildrenGroup({
  nodes,
  onOpen,
}: {
  nodes: ReadonlyArray<SubRunNode>;
  onOpen: SubRunOpenCallback;
}) {
  const sorted = sortSubRunNodes(nodes);
  const runningNodes = sorted.filter((node) => node.thread.status === "running");
  const foldedNodes = sorted.filter((node) => node.thread.status !== "running");
  return (
    <div className="flex flex-col">
      {runningNodes.map((node) => (
        <SubRunNodeView key={node.thread.id} node={node} onOpen={onOpen} />
      ))}
      {foldedNodes.length > 0 ? (
        <SettledSubRunDisclosure nodes={foldedNodes} onOpen={onOpen} />
      ) : null}
    </div>
  );
}

/** The dim fold row for one level's non-running sub-runs. */
function SettledSubRunDisclosure({
  nodes,
  onOpen,
}: {
  nodes: ReadonlyArray<SubRunNode>;
  onOpen: SubRunOpenCallback;
}) {
  const [open, setOpen] = useState(false);
  // Oldest first (last activity), matching the cleanup-nudge digest order.
  const ordered = sortFoldedSubRunThreads(nodes.map((node) => node.thread));
  const oldestAge = ordered.length > 0 ? formatRelativeTime(ordered[0]!.lastMessageAt) : "";
  return (
    <div data-t3team-settled-fold="true">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground/70 hover:bg-accent/40 hover:text-muted-foreground"
      >
        <Chevron open={open} className="shrink-0" />
        <span>
          Settled ({nodes.length}){oldestAge !== "" ? ` · oldest ${oldestAge}` : ""}
          {open ? " · collapse" : " · expand"}
        </span>
      </button>
      {open ? (
        <div className={INDENT_CLASS}>
          <div className="flex flex-col">
            {ordered.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => onOpen({ projectId: thread.projectId, threadId: thread.id })}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/80 hover:bg-accent/40"
              >
                <SubRunStatusIcon status={thread.status} className="size-2.5" />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                <span className="shrink-0 font-mono text-[.65rem] tabular-nums text-muted-foreground/60">
                  {formatRelativeTime(thread.lastMessageAt)}
                </span>
              </button>
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
