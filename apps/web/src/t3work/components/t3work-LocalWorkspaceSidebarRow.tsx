/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectShellProject } from "@t3tools/project-context";
import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon, FolderIcon } from "lucide-react";
import { useMemo } from "react";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import type {
  ProjectThread,
  ThreadSortOrder,
  ThreadStatusPill,
  ViewState,
} from "~/t3work/t3work-types";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { SidebarMenuButton, SidebarMenuSub } from "~/t3work/components/ui/t3work-sidebar";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { LocalWorkspaceSidebarRowActions } from "./t3work-LocalWorkspaceSidebarRowActions";
import { buildProjectSidebarAddToChatRequest } from "./t3work-projectSidebarAddToChatRequests";
import { sortThreads } from "./t3work-projectSidebarShared";
import {
  getSidebarProjectState,
  getSidebarStandaloneButtonClassName,
  getSidebarThreadState,
} from "./t3work-projectSidebarItemState";
import { useLocalWorkspaceRowState } from "./t3work-useLocalWorkspaceRowState";

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
  const sortedProjectThreads = useMemo(
    () => sortThreads(projectThreads, threadSortOrder),
    [projectThreads, threadSortOrder],
  );
  const visibleThreads =
    sortedProjectThreads.length > threadPreviewCount
      ? sortedProjectThreads.slice(0, threadPreviewCount)
      : sortedProjectThreads;
  const hiddenThreadCount = Math.max(0, sortedProjectThreads.length - visibleThreads.length);
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
    await addToChatFromRequest(
      buildProjectSidebarAddToChatRequest({
        project,
        projectTickets: [],
        linkedRepositoryUrls,
      }),
      { type: "thread", threadId },
    );
  };

  return (
    <>
      <div className="group/project-header relative" onContextMenu={handleContextMenu}>
        <SidebarMenuButton
          size="sm"
          className={`gap-2 px-2 py-1.5 pr-8 text-left group-hover/project-header:bg-accent group-hover/project-header:text-foreground group-focus-within/project-header:bg-accent group-focus-within/project-header:text-foreground max-sm:pr-14 cursor-pointer ${getSidebarStandaloneButtonClassName(
            projectState,
          )}`}
          onClick={() => onToggleExpand(project.id)}
        >
          {!expanded && projectStatus ? (
            <span
              aria-hidden="true"
              title={projectStatus.label}
              className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
            >
              <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                <span
                  className={`size-[9px] rounded-full ${projectStatus.dotClass} ${projectStatus.pulse ? "animate-pulse" : ""}`}
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
            <ProjectFavicon environmentId={environmentId} cwd={workspaceRoot} />
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
        </SidebarMenuButton>

        <LocalWorkspaceSidebarRowActions
          projectTitle={project.title}
          onNewThread={handleNewThread}
          onOpenMenu={handleOpenMenu}
        />
      </div>

      {expanded ? (
        <SidebarMenuSub className="mx-1 mt-1 mb-1.5 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0.5">
          {visibleThreads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              state={getSidebarThreadState({ view, threadId: thread.id })}
              workspacePath={workspaceRoot}
              onSelect={() => onSelectThread(project.id, thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
            />
          ))}
          {hiddenThreadCount > 0 ? (
            <div className="px-2 py-1 text-[10px] text-muted-foreground/60">
              +{hiddenThreadCount} more
            </div>
          ) : null}
          {sortedProjectThreads.length === 0 ? (
            <div className="px-2 py-1 text-[10px] text-muted-foreground/60">No threads yet</div>
          ) : null}
        </SidebarMenuSub>
      ) : null}
    </>
  );
}
