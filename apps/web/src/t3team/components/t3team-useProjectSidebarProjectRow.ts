/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { useCallback, useMemo, useState } from "react";
import { useAddToChat } from "~/t3team/hooks/t3team-useAddToChat";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { sortThreads } from "./t3team-projectSidebarShared";
import type { ProjectRowProps } from "./t3team-projectSidebarProjectRowTypes";
import { readLinkedRepositoryUrlsFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { buildProjectSidebarAddToChatRequest } from "./t3team-projectSidebarAddToChatRequests";
import { useProjectGitHubActivity } from "~/t3team/hooks/t3team-useProjectGitHubActivity";
import { buildProjectSidebarThreadGroups } from "./t3team-projectSidebarThreadGroups";
import { useProjectSidebarProjectRename } from "./t3team-useProjectSidebarProjectRename";
import { useProjectSidebarNavItemPreferences } from "./t3team-useProjectSidebarNavItemPreferences";
import { deriveTicketVisibility } from "./t3team-projectSidebarProjectRow.helpers";
import { buildVisibleTicketIdSet } from "./t3team-projectSidebarVisibleTicketIds";
import { buildProjectTicketLookup } from "~/t3team/t3team-ticketLookup";

export function useProjectSidebarProjectRow(props: ProjectRowProps) {
  const {
    project,
    projectThreads,
    projectTickets,
    threadSortOrder,
    threadPreviewCount,
    ticketViewMode,
    showJiraItems,
    expanded,
    onSelectProject,
    onToggleExpand,
    onManageProjectRecipes,
    onManageProjectRepositories,
    onDeleteProject,
    onRenameProject,
    onCreateThread,
  } = props;

  const [expandedThreadList, setExpandedThreadList] = useState(false);
  const [myWorkExpanded, setMyWorkExpanded] = useState(true);
  const { addToChatFromRequest } = useAddToChat();
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
  const { hiddenItemIds, orderedItemIds } = useProjectSidebarNavItemPreferences(project.id);

  const ticketHierarchy = useMemo(
    () => buildProjectTicketHierarchy(projectTickets),
    [projectTickets],
  );
  const ticketLookup = useMemo(() => buildProjectTicketLookup(projectTickets), [projectTickets]);
  const { visibleFlatTickets, visibleTreeRoots, visibleTreeUnresolvedChildren, hiddenTicketCount } =
    useMemo(
      () =>
        deriveTicketVisibility({
          projectId: project.id,
          projectTickets,
          ticketHierarchy,
          ticketViewMode,
          hiddenItemIds,
          orderedItemIds,
        }),
      [hiddenItemIds, orderedItemIds, project.id, projectTickets, ticketHierarchy, ticketViewMode],
    );
  const visibleTicketIds = useMemo(
    () =>
      buildVisibleTicketIdSet({
        showJiraItems,
        ticketViewMode,
        visibleFlatTickets,
        visibleTreeRoots,
        visibleTreeUnresolvedChildren,
        childrenByParentId: ticketHierarchy.childrenByParentId,
      }),
    [
      showJiraItems,
      ticketViewMode,
      visibleFlatTickets,
      visibleTreeRoots,
      visibleTreeUnresolvedChildren,
      ticketHierarchy,
    ],
  );
  const { projectLevelThreads, dashboardThreadsByMode, ticketThreadsById } = useMemo(
    () => buildProjectSidebarThreadGroups(sortedThreads, { visibleTicketIds, ticketLookup }),
    [sortedThreads, ticketLookup, visibleTicketIds],
  );
  const {
    isRenaming,
    renameTitle,
    renameInputRef,
    setRenameTitle,
    handleContextMenu,
    handleOpenMenu,
    handleRenameSubmit,
    handleRenameKeyDown,
  } = useProjectSidebarProjectRename({
    project,
    onDeleteProject,
    onManageProjectRecipes,
    onManageProjectRepositories,
    onRenameProject,
  });

  const hasOverflowingThreads = projectLevelThreads.length > threadPreviewCount;
  const visibleThreads =
    expandedThreadList || !hasOverflowingThreads
      ? projectLevelThreads
      : projectLevelThreads.slice(0, threadPreviewCount);

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
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const threadId = onCreateThread(project.id);
      await addToChatFromRequest(
        buildProjectSidebarAddToChatRequest({ project, projectTickets, linkedRepositoryUrls }),
        { type: "thread", threadId },
      );
    },
    [addToChatFromRequest, linkedRepositoryUrls, onCreateThread, project, projectTickets],
  );

  return {
    isRenaming,
    renameTitle,
    renameInputRef,
    setRenameTitle,
    hasOverflowingThreads,
    expandedThreadList,
    setExpandedThreadList,
    myWorkExpanded,
    setMyWorkExpanded,
    backlogThreads: dashboardThreadsByMode.backlog,
    myWorkThreads: dashboardThreadsByMode["my-work"],
    visibleThreads,
    visibleTicketIds,
    hiddenItemIds,
    orderedItemIds,
    ticketHierarchy,
    ticketThreadsById,
    visibleFlatTickets,
    visibleTreeRoots,
    visibleTreeUnresolvedChildren,
    hiddenTicketCount,
    githubActivityByWorkItem: githubActivity.activityByWorkItem,
    unlinkedGitHubActivityItems: githubActivity.unlinkedActivityItems,
    githubActivityLastCheckedAt: githubActivity.lastCheckedAt,
    handleProjectClick,
    handleToggleExpand,
    handleNewThread,
    handleContextMenu,
    handleOpenMenu,
    handleRenameSubmit,
    handleRenameKeyDown,
  };
}
