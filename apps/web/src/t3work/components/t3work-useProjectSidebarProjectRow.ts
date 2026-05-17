import { useCallback, useMemo, useRef, useState } from "react";
import { buildProjectTicketHierarchy } from "~/t3work/t3work-ticketHierarchy";
import { readLocalApi } from "~/localApi";
import type { ProjectThread, ProjectTicket } from "~/t3work/t3work-types";
import { sortThreads } from "./t3work-projectSidebarShared";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

export function useProjectSidebarProjectRow(props: ProjectRowProps) {
  const {
    project,
    projectThreads,
    projectTickets,
    threadSortOrder,
    threadPreviewCount,
    ticketViewMode,
    onSelectProject,
    onDeleteProject,
    onRenameProject,
    onCreateThread,
  } = props;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(project.title);
  const [expandedThreadList, setExpandedThreadList] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

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
  const visibleFlatTickets = useMemo(() => projectTickets.slice(0, 5), [projectTickets]);
  const visibleTreeRoots = useMemo(() => ticketHierarchy.roots.slice(0, 5), [ticketHierarchy]);

  const visibleTreeUnresolvedChildren = useMemo(() => {
    const availableSlots = Math.max(0, 5 - visibleTreeRoots.length);
    return availableSlots === 0
      ? ([] as readonly ProjectTicket[])
      : ticketHierarchy.unresolvedChildren.slice(0, availableSlots);
  }, [ticketHierarchy, visibleTreeRoots.length]);

  const countVisibleTicketTreeNodes = useCallback(
    (ticket: ProjectTicket): number => {
      const children = ticketHierarchy.childrenByParentId.get(ticket.id) ?? [];
      return 1 + children.reduce((count, child) => count + countVisibleTicketTreeNodes(child), 0);
    },
    [ticketHierarchy],
  );

  const hiddenTicketCount = useMemo(() => {
    if (ticketViewMode === "flat") {
      return Math.max(0, projectTickets.length - visibleFlatTickets.length);
    }
    const visibleTreeCount =
      visibleTreeRoots.reduce((count, ticket) => count + countVisibleTicketTreeNodes(ticket), 0) +
      visibleTreeUnresolvedChildren.length;
    return Math.max(0, projectTickets.length - visibleTreeCount);
  }, [
    countVisibleTicketTreeNodes,
    projectTickets.length,
    ticketViewMode,
    visibleFlatTickets.length,
    visibleTreeRoots,
    visibleTreeUnresolvedChildren.length,
  ]);

  const handleProjectClick = useCallback(() => {
    onSelectProject(project.id);
  }, [onSelectProject, project.id]);

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
      const api = readLocalApi();
      if (!api) return;

      const action = await api.contextMenu.show(
        [
          { id: "rename", label: "Rename project" },
          { id: "delete", label: "Delete project", destructive: true },
        ],
        { x: e.clientX, y: e.clientY },
      );

      if (action === "rename") {
        setRenameTitle(project.title);
        setIsRenaming(true);
        requestAnimationFrame(() => {
          renameInputRef.current?.focus();
          renameInputRef.current?.select();
        });
      } else if (action === "delete") {
        const confirmed = await api.dialogs.confirm(`Delete project "${project.title}"?`);
        if (confirmed) onDeleteProject(project.id);
      }
    },
    [onDeleteProject, project],
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
    handleProjectClick,
    handleNewThread,
    handleContextMenu,
    handleRenameSubmit,
    handleRenameKeyDown,
  };
}
