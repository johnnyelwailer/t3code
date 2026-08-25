import { FolderPlusIcon } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from "~/t3team/components/ui/t3team-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { useT3TeamAddLocalWorkspace } from "./t3team-addLocalWorkspaceContext";
import type { ProjectThread, ThreadSortOrder, ViewState } from "~/t3team/t3team-types";
import { LocalWorkspaceSidebarRow } from "./t3team-LocalWorkspaceSidebarRow";
import { usePrimarySettings } from "~/hooks/useSettings";
import { resolveProjectStatusIndicator } from "./t3team-projectSidebarShared";

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
  onRenameProject: (id: string, newTitle: string) => void;
  onDeleteProject: (id: string) => void;
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
  onRenameProject,
  onDeleteProject,
}: LocalWorkspaceSidebarSectionProps) {
  const openAddProject = useT3TeamAddLocalWorkspace();
  const activityLabelsEnabled = usePrimarySettings(
    (settings) => settings.t3teamActivityLabelsEnabled,
  );

  return (
    <SidebarGroup className="px-2 py-2">
      <div className="group/workspaces-header mb-1 flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Local workspaces
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 pointer-events-none group-hover/workspaces-header:opacity-100 group-hover/workspaces-header:pointer-events-auto group-focus-within/workspaces-header:opacity-100 group-focus-within/workspaces-header:pointer-events-auto">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Add local workspace"
                  data-testid="sidebar-add-local-workspace-trigger"
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  onClick={openAddProject}
                />
              }
            >
              <FolderPlusIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="right">Add local workspace</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      <SidebarMenu>
        {looseWorkspaceProjects.map((project) => {
          const projectThreads = getThreadsForProject(project.id);
          const expanded = expandedIds.has(project.id);
          const projectStatus = resolveProjectStatusIndicator(projectThreads, {
            activityLabelsEnabled,
          });
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
                onRenameProject={onRenameProject}
                onDeleteProject={onDeleteProject}
              />
            </SidebarMenuItem>
          );
        })}

        {looseWorkspaceProjects.length === 0 ? (
          <div className="px-2 py-1 text-[10px] text-muted-foreground/50">No local workspaces</div>
        ) : null}
      </SidebarMenu>
    </SidebarGroup>
  );
}
