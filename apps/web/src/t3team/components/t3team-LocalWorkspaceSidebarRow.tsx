/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectShellProject } from "@t3tools/project-context";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";
import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon, FolderIcon } from "lucide-react";
import { useMemo } from "react";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import type {
  ProjectThread,
  ThreadSortOrder,
  ThreadStatusPill,
  ViewState,
} from "~/t3team/t3team-types";
import { useAddToChat } from "~/t3team/hooks/t3team-useAddToChat";
import { readLinkedRepositoryUrlsFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { T3SidebarRow, T3SidebarSubList } from "~/t3team/components/ui/t3team-sidebar-row";
import { LocalWorkspaceSidebarRowActions } from "./t3team-LocalWorkspaceSidebarRowActions";
import { buildNewThreadProjectContextRequest } from "./t3team-projectSidebarAddToChatRequests";
import { ProjectSidebarThreadTreeRows } from "./t3team-ProjectSidebarThreadTreeRows";
import { getSidebarProjectState } from "./t3team-projectSidebarItemState";
import { useLocalWorkspaceRowState } from "./t3team-useLocalWorkspaceRowState";
import { useLocalWorkspaceThreadTree } from "./t3team-useLocalWorkspaceThreadTree";

type LocalWorkspaceSidebarRowProps = {
  project: ProjectShellProject;
  projectThreads: ProjectThread[];
  expanded: boolean;
  projectStatus: ThreadStatusPill | null;
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

function readWorkspaceEnvironmentId(project: ProjectShellProject): EnvironmentId | null {
  const raw = project.source.raw;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const environmentId = (raw as Record<string, unknown>).environmentId;
  return typeof environmentId === "string" ? (environmentId as EnvironmentId) : null;
}

export function LocalWorkspaceSidebarRow({
  project,
  projectThreads,
  expanded,
  projectStatus,
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
}: LocalWorkspaceSidebarRowProps) {
  const environmentId = readWorkspaceEnvironmentId(project);
  const workspaceRoot = project.workspace?.rootPath ?? null;
  const { addToChatFromRequest } = useAddToChat();
  const linkedRepositoryUrls = useMemo(
    () => readLinkedRepositoryUrlsFromProject(project),
    [project],
  );
  const {
    sortedProjectThreads,
    threadTree,
    visibleRootThreads,
    hiddenThreadCount,
    showAllThreads,
    toggleShowAllThreads,
  } = useLocalWorkspaceThreadTree({ projectThreads, threadSortOrder, threadPreviewCount });
  const projectState = getSidebarProjectState({ view, projectId: project.id });

  const {
    isRenaming,
    renameTitle,
    renameInputRef,
    setRenameTitle,
    handleContextMenu,
    handleOpenMenu,
    handleRenameSubmit,
    handleRenameKeyDown,
  } = useLocalWorkspaceRowState({
    project,
    threadCount: projectThreads.length,
    onRenameProject,
    onDeleteProject,
  });

  const handleNewThread = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const threadId = onCreateThread(project.id);
    const contextRequest = buildNewThreadProjectContextRequest({
      project,
      projectTickets: [],
      linkedRepositoryUrls,
    });
    if (!contextRequest) {
      return;
    }
    await addToChatFromRequest(contextRequest, { type: "thread", threadId });
  };

  return (
    <>
      <div className="group/project-header relative" onContextMenu={handleContextMenu}>
        <T3SidebarRow
          hoverGroup="project-header"
          isActive={projectState.isSelected}
          // Keeps the title clear of the actions overlaid on the row's end.
          className="pr-8 max-sm:pr-14"
          onClick={() => onToggleExpand(project.id)}
        >
          {!expanded && projectStatus ? (
            <span
              aria-hidden="true"
              title={resolveActivityPillDisplay(projectStatus)}
              className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
            >
              <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                <span
                  className={`size-[9px] rounded-full ${projectStatus.dotClass} ${projectStatus.pulse ? (projectStatus.pulseClass ?? "animate-pulse") : ""}`}
                />
              </span>
              <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
            </span>
          ) : (
            <ChevronRightIcon
              className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
          )}

          {environmentId && workspaceRoot ? (
            <ProjectFavicon
              project={{
                environmentId,
                workspaceRoot,
                title: project.title,
                faviconPath: null,
                projectIcon: null,
              }}
            />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
          )}

          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
              {project.title}
            </span>
          )}
        </T3SidebarRow>

        <LocalWorkspaceSidebarRowActions
          projectTitle={project.title}
          onNewThread={handleNewThread}
          onOpenMenu={handleOpenMenu}
        />
      </div>

      {expanded ? (
        <T3SidebarSubList className="mx-1 mt-1 mb-1.5 w-full overflow-hidden">
          <ProjectSidebarThreadTreeRows
            projectId={project.id}
            roots={visibleRootThreads}
            tree={threadTree}
            view={view}
            workspacePath={workspaceRoot}
            onSelectThread={onSelectThread}
            onDeleteThread={onDeleteThread}
            onRenameThread={onRenameThread}
          />
          {hiddenThreadCount > 0 || showAllThreads ? (
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-3xs text-muted-foreground/60 hover:text-foreground"
              onClick={toggleShowAllThreads}
            >
              {showAllThreads ? "Show less" : `+${hiddenThreadCount} more`}
            </button>
          ) : null}
          {sortedProjectThreads.length === 0 ? (
            <div className="px-2 py-1 text-3xs text-muted-foreground/60">No threads yet</div>
          ) : null}
        </T3SidebarSubList>
      ) : null}
    </>
  );
}
