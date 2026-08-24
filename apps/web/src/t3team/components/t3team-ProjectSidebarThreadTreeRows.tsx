import { ChevronRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ProjectThread, ViewState } from "~/t3team/t3team-types";
import type { ProjectSidebarThreadTree } from "./t3team-projectSidebarThreadTree";
import { ProjectSidebarThreadRowItem } from "./t3team-ProjectSidebarThreadRow";
import { readActiveThreadIdFromView } from "~/t3team/t3team-types";

type ProjectSidebarThreadTreeRowsProps = {
  projectId: string;
  roots: ReadonlyArray<ProjectThread>;
  tree: ProjectSidebarThreadTree;
  view: ViewState | null;
  workspacePath: string | null;
  variant?: "issue";
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
};

export function ProjectSidebarThreadTreeRows({
  projectId,
  roots,
  tree,
  view,
  workspacePath,
  variant,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: ProjectSidebarThreadTreeRowsProps) {
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const activeThreadId = readActiveThreadIdFromView(view);

  const toggleChildren = (threadId: string) => {
    setCollapsedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const renderBranch = (thread: ProjectThread, ancestors: ReadonlySet<string>): ReactNode => {
    const nextAncestors = new Set(ancestors).add(thread.id);
    const children = (tree.childThreadsByParentId.get(thread.id) ?? []).filter(
      (child) => !nextAncestors.has(child.id),
    );
    const hasChildren = children.length > 0;
    const expanded = !collapsedThreadIds.has(thread.id);

    return (
      <div key={thread.id}>
        <div
          className={hasChildren ? "relative [&_[data-sidebar=menu-sub-button]]:pl-6" : "relative"}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} child threads for ${thread.title}`}
              aria-expanded={expanded}
              className="absolute top-1 left-0 z-10 inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => toggleChildren(thread.id)}
            >
              <ChevronRightIcon
                className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </button>
          ) : null}
          <ProjectSidebarThreadRowItem
            thread={thread}
            {...(variant ? { variant } : {})}
            isSelected={activeThreadId === thread.id}
            workspacePath={workspacePath}
            projectId={projectId}
            onSelectThread={onSelectThread}
            onDeleteThread={onDeleteThread}
            onRenameThread={onRenameThread}
            wrapWithMenuItem={false}
          />
        </div>
        {hasChildren && expanded ? (
          <div className="mt-1 ml-2 space-y-1 pl-2">
            {children.map((child) => renderBranch(child, nextAncestors))}
          </div>
        ) : null}
      </div>
    );
  };

  return roots.map((thread) => renderBranch(thread, new Set()));
}
