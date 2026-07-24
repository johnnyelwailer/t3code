export type SidebarContentToggleId =
  | "projectThreads"
  | "myActivityFeed"
  | "jiraItems"
  | "gitHubActivity";

type SidebarContentToggleModel = {
  id: SidebarContentToggleId;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
};

export function buildSidebarContentMenuModel(input: {
  showProjectThreads: boolean;
  showMyActivityFeed: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
}) {
  const { showProjectThreads, showMyActivityFeed, showJiraItems, showGitHubActivity } = input;
  const feedContentDisabled = !showMyActivityFeed;
  const primaryItems: Array<SidebarContentToggleModel> = [
    {
      id: "projectThreads",
      label: "Project threads",
      description: "Standalone threads outside Backlog and My work.",
      checked: showProjectThreads,
    },
    {
      id: "myActivityFeed",
      label: "My activity feed",
      description: showMyActivityFeed
        ? "Shows My work items and GitHub activity."
        : "Off: only pinned items stay visible.",
      checked: showMyActivityFeed,
    },
  ];
  const feedItems: Array<SidebarContentToggleModel> = [
    {
      id: "jiraItems",
      label: "Work items",
      description: feedContentDisabled
        ? "Turn My activity feed on to show this."
        : "Ticket rows from Jira in My work.",
      checked: showJiraItems,
      disabled: feedContentDisabled,
    },
    {
      id: "gitHubActivity",
      label: "GitHub activity",
      description: feedContentDisabled
        ? "Turn My activity feed on to show this."
        : "PRs and GitHub updates in My work.",
      checked: showGitHubActivity,
      disabled: feedContentDisabled,
    },
  ];

  return {
    title: "Sidebar content",
    description: "Choose which sections appear in the project sidebar.",
    feedTitle: "Inside My activity feed",
    primaryItems,
    feedItems,
  };
}
