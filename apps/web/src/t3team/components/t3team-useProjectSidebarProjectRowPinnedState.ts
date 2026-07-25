import { useProjectSidebarPinnedItems } from "./t3team-useProjectSidebarPinnedItems";
import { buildPinnedOnlyMyActivityFeed } from "./t3team-projectSidebarProjectRow.helpers";
import type { ProjectRowProps } from "./t3team-projectSidebarProjectRowTypes";
import { useProjectSidebarProjectRow } from "./t3team-useProjectSidebarProjectRow";

export function useProjectSidebarProjectRowPinnedState(
  props: ProjectRowProps,
  state: ReturnType<typeof useProjectSidebarProjectRow>,
) {
  const pinnedItems = useProjectSidebarPinnedItems({
    project: props.project,
    projectTickets: props.projectTickets,
    projectThreads: props.projectThreads,
    githubActivityByWorkItem: state.githubActivityByWorkItem,
    unlinkedGitHubActivityItems: state.unlinkedGitHubActivityItems,
  });
  const showPinnedOnlyFeed = !props.showMyActivityFeed;
  const pinnedOnlyFeed = buildPinnedOnlyMyActivityFeed({
    projectId: props.project.id,
    projectTickets: props.projectTickets,
    ticketHierarchy: state.ticketHierarchy,
    ticketViewMode: props.ticketViewMode,
    hiddenItemIds: state.hiddenItemIds,
    orderedItemIds: state.orderedItemIds,
    pinnedItems,
    githubActivityByWorkItem: state.githubActivityByWorkItem,
    unlinkedGitHubActivityItems: state.unlinkedGitHubActivityItems,
  });

  return {
    pinnedItems,
    showPinnedOnlyFeed,
    effectiveProjectTickets: showPinnedOnlyFeed
      ? pinnedOnlyFeed.projectTickets
      : props.projectTickets,
    effectiveTicketHierarchy: showPinnedOnlyFeed
      ? pinnedOnlyFeed.ticketHierarchy
      : state.ticketHierarchy,
    effectiveVisibleFlatTickets: showPinnedOnlyFeed
      ? pinnedOnlyFeed.visibleFlatTickets
      : state.visibleFlatTickets,
    effectiveGitHubActivityByWorkItem: showPinnedOnlyFeed
      ? pinnedOnlyFeed.githubActivityByWorkItem
      : state.githubActivityByWorkItem,
    effectiveUnlinkedGitHubItems: showPinnedOnlyFeed
      ? pinnedOnlyFeed.unlinkedGitHubActivityItems
      : state.unlinkedGitHubActivityItems,
    effectiveVisibleTicketIds: showPinnedOnlyFeed
      ? pinnedOnlyFeed.visibleTicketIds
      : state.visibleTicketIds,
    effectiveHiddenTicketCount: showPinnedOnlyFeed
      ? pinnedOnlyFeed.hiddenTicketCount
      : state.hiddenTicketCount,
  };
}
