import { useCallback, useMemo, useRef, useState } from "react";
import { buildProjectTicketHierarchy } from "~/t3work/t3work-ticketHierarchy";
import type { ProjectThread } from "~/t3work/t3work-types";
import { sortThreads } from "./t3work-projectSidebarShared";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useProjectGitHubActivity } from "~/t3work/hooks/t3work-useProjectGitHubActivity";
import {
  deriveTicketVisibility,
  showProjectContextMenu,
} from "./t3work-projectSidebarProjectRow.helpers";

export function useProjectSidebarProjectRow(props: ProjectRowProps) {
  const {
    project,
    projectThreads,
    projectTickets,
    threadSortOrder,
    threadPreviewCount,
    ticketViewMode,
    expanded,
    onSelectProject,
    onToggleExpand,
    onManageProjectRepositories,
    onDeleteProject,
    onRenameProject,
    onCreateThread,
  } = props;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(project.title);
  const [expandedThreadList, setExpandedThreadList] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const linkedRepositoryUrls = useMemo(
    () => readLinkedRepositoryUrlsFromProject(project),
    [project],
  );
  const githubActivity = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls,
    enabled: expanded,
  });

  const sortedThreads = useMemo(
    () => sortThreads(projectThreads, threadSortOrder),
    [projectThreads, threadSortOrder],
  );
  const projectLevelThreads = useMemo(
    () => sortedThreads.filter((thread) => !thread.ticketId),
    [sortedThreads],
  );

  const ticketThreadsById = useMemo(() => {
    const map = new Map<string, ProjectThread[]>();
    for (const thread of sortedThreads) {
      if (!thread.ticketId) continue;
      const existing = map.get(thread.ticketId) ?? [];
      existing.push(thread);
      map.set(thread.ticketId, existing);
    }
    return map;
  }, [sortedThreads]);

  const hasOverflowingThreads = projectLevelThreads.length > threadPreviewCount;
  const visibleThreads =
    expandedThreadList || !hasOverflowingThreads
      ? projectLevelThreads
      : projectLevelThreads.slice(0, threadPreviewCount);

  const ticketHierarchy = useMemo(
    () => buildProjectTicketHierarchy(projectTickets),
    [projectTickets],
  );
  const { visibleFlatTickets, visibleTreeRoots, visibleTreeUnresolvedChildren, hiddenTicketCount } =
    useMemo(
      () =>
        deriveTicketVisibility({
          projectTickets,
          ticketHierarchy,
          ticketViewMode,
        }),
      [projectTickets, ticketHierarchy, ticketViewMode],
    );

  const handleProjectClick = useCallback(() => {
    onSelectProject(project.id);
  }, [onSelectProject, project.id]);

  const handleToggleExpand = useCallback(
    (e: React.SyntheticEvent) => {
      e.stopPropagation();
      onToggleExpand(project.id);
    },
    [onToggleExpand, project.id],
  );

  const handleNewThread = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCreateThread(project.id);
    },
    [onCreateThread, project.id],
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      await showProjectContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        projectId: project.id,
        projectTitle: project.title,
        onManageProjectRepositories,
        onDeleteProject,
        onBeginRename: () => {
          setRenameTitle(project.title);
          setIsRenaming(true);
          requestAnimationFrame(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
          });
        },
      });
    },
    [onDeleteProject, onManageProjectRepositories, project],
  );

  const handleOpenMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      await showProjectContextMenu({
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.bottom),
        projectId: project.id,
        projectTitle: project.title,
        onManageProjectRepositories,
        onDeleteProject,
        onBeginRename: () => {
          setRenameTitle(project.title);
          setIsRenaming(true);
          requestAnimationFrame(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
          });
        },
      });
    },
    [onDeleteProject, onManageProjectRepositories, project],
  );

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameTitle.trim();
    if (trimmed && trimmed !== project.title) {
      onRenameProject(project.id, trimmed);
    } else {
      setRenameTitle(project.title);
    }
    setIsRenaming(false);
  }, [renameTitle, project, onRenameProject]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleRenameSubmit();
      else if (e.key === "Escape") {
        setRenameTitle(project.title);
        setIsRenaming(false);
      }
    },
    [handleRenameSubmit, project.title],
  );

  return {
    isRenaming,
    renameTitle,
    renameInputRef,
    setRenameTitle,
    hasOverflowingThreads,
    expandedThreadList,
    setExpandedThreadList,
    visibleThreads,
    ticketHierarchy,
    ticketThreadsById,
    visibleFlatTickets,
    visibleTreeRoots,
    visibleTreeUnresolvedChildren,
    hiddenTicketCount,
    githubActivityByWorkItem: githubActivity.activityByWorkItem,
    handleProjectClick,
    handleToggleExpand,
    handleNewThread,
    handleContextMenu,
    handleOpenMenu,
    handleRenameSubmit,
    handleRenameKeyDown,
  };
}
