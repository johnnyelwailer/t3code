import { useMemo } from "react";
import { SidebarMenuSub } from "~/t3team/components/ui/t3team-sidebar";
import type { ProjectThread, ViewState } from "~/t3team/t3team-types";
import { ProjectSidebarThreadTreeRows } from "./t3team-ProjectSidebarThreadTreeRows";
import { buildProjectSidebarThreadTree } from "./t3team-projectSidebarThreadTree";

type ProjectSidebarDashboardThreadListProps = {
  projectId: string;
  workspaceRoot: string | null;
  threads: ReadonlyArray<ProjectThread>;
  view: ViewState | null;
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
};

export function ProjectSidebarDashboardThreadList({
  projectId,
  workspaceRoot,
  threads,
  view,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: ProjectSidebarDashboardThreadListProps) {
  const threadTree = useMemo(() => buildProjectSidebarThreadTree(threads), [threads]);

  if (threads.length === 0) {
    return null;
  }

  return (
    <SidebarMenuSub className="mx-1 -mt-0.5 mb-1 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0.5">
      <ProjectSidebarThreadTreeRows
        projectId={projectId}
        roots={threadTree.rootThreads}
        tree={threadTree}
        view={view}
        workspacePath={workspaceRoot}
        variant="issue"
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        onRenameThread={onRenameThread}
      />
    </SidebarMenuSub>
  );
}
