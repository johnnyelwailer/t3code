import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectThread, ThreadSortOrder, ViewState } from "~/t3work/t3work-types";
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from "~/t3work/components/ui/t3work-sidebar";
import { LocalWorkspaceSidebarRow } from "./t3work-LocalWorkspaceSidebarRow";
import { resolveProjectStatusIndicator } from "./t3work-projectSidebarShared";

type LocalWorkspaceSidebarSectionProps = {
  looseWorkspaceProjects: ProjectShellProject[];
  expandedIds: Set<string>;
  getThreadsForProject: (projectId: string) => ProjectThread[];
  view: ViewState | null;
  threadSortOrder: ThreadSortOrder;
  threadPreviewCount: number;
  onToggleExpand: (id: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onCreateThread: (projectId: string) => string;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
};

export function LocalWorkspaceSidebarSection({
  looseWorkspaceProjects,
  expandedIds,
  getThreadsForProject,
  view,
  threadSortOrder,
  threadPreviewCount,
  onToggleExpand,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onRenameThread,
}: LocalWorkspaceSidebarSectionProps) {
  if (looseWorkspaceProjects.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Local workspaces
        </span>
      </div>

      <SidebarMenu>
        {looseWorkspaceProjects.map((project) => {
          const projectThreads = getThreadsForProject(project.id);
          const expanded = expandedIds.has(project.id);
          const projectStatus = resolveProjectStatusIndicator(projectThreads);
          return (
            <SidebarMenuItem key={project.id} className="mb-2 rounded-md last:mb-0">
              <LocalWorkspaceSidebarRow
                project={project}
                projectThreads={projectThreads}
                expanded={expanded}
                projectStatus={projectStatus}
                view={view}
                threadSortOrder={threadSortOrder}
                threadPreviewCount={threadPreviewCount}
                onToggleExpand={onToggleExpand}
                onSelectThread={onSelectThread}
                onCreateThread={onCreateThread}
                onDeleteThread={onDeleteThread}
                onRenameThread={onRenameThread}
              />
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
