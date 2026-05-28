import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

export function deriveProjectSidebarPinnedFeedState<
  TPinnedItem extends { kind: string },
  TGitHubItem,
>(input: {
  showPinnedOnlyFeed: boolean;
  ticketViewMode: ProjectRowProps["ticketViewMode"];
  pinnedItems: ReadonlyArray<TPinnedItem>;
  effectiveProjectTickets: ReadonlyArray<unknown>;
  effectiveUnlinkedGitHubItems: ReadonlyArray<TGitHubItem>;
  effectiveVisibleTicketIds: ReadonlySet<string>;
}) {
  const showPinnedOnlyHierarchy = input.showPinnedOnlyFeed && input.ticketViewMode === "tree";
  const visiblePinnedItems = showPinnedOnlyHierarchy
    ? input.pinnedItems.filter((item) => item.kind !== "jira-work-item")
    : input.pinnedItems;

  return {
    currentIssueCount:
      showPinnedOnlyHierarchy || !input.showPinnedOnlyFeed
        ? input.effectiveProjectTickets.length
        : 0,
    githubItems:
      showPinnedOnlyHierarchy || !input.showPinnedOnlyFeed
        ? input.effectiveUnlinkedGitHubItems
        : [],
    pinnedItemVisibleTicketIds: showPinnedOnlyHierarchy
      ? input.effectiveVisibleTicketIds
      : input.showPinnedOnlyFeed
        ? new Set<string>()
        : input.effectiveVisibleTicketIds,
    visiblePinnedItems,
  };
}
