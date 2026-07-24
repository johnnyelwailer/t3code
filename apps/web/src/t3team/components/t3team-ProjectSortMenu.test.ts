import { describe, expect, it } from "vite-plus/test";

import { buildSidebarContentMenuModel } from "./t3team-projectSortMenuSidebarContent";

describe("buildSidebarContentMenuModel", () => {
  it("describes the sidebar sections clearly when the feed is on", () => {
    const model = buildSidebarContentMenuModel({
      showProjectThreads: true,
      showMyActivityFeed: true,
      showJiraItems: true,
      showGitHubActivity: false,
    });

    expect(model.title).toBe("Sidebar content");
    expect(model.description).toBe("Choose which sections appear in the project sidebar.");
    expect(model.feedTitle).toBe("Inside My activity feed");
    expect(model.primaryItems).toEqual([
      {
        id: "projectThreads",
        label: "Project threads",
        description: "Standalone threads outside Backlog and My work.",
        checked: true,
      },
      {
        id: "myActivityFeed",
        label: "My activity feed",
        description: "Shows My work items and GitHub activity.",
        checked: true,
      },
    ]);
    expect(model.feedItems).toEqual([
      {
        id: "jiraItems",
        label: "Work items",
        description: "Ticket rows from Jira in My work.",
        checked: true,
        disabled: false,
      },
      {
        id: "gitHubActivity",
        label: "GitHub activity",
        description: "PRs and GitHub updates in My work.",
        checked: false,
        disabled: false,
      },
    ]);
  });

  it("marks feed-specific toggles as inactive when the feed is off", () => {
    const model = buildSidebarContentMenuModel({
      showProjectThreads: false,
      showMyActivityFeed: false,
      showJiraItems: true,
      showGitHubActivity: true,
    });

    expect(model.primaryItems[1]).toEqual({
      id: "myActivityFeed",
      label: "My activity feed",
      description: "Off: only pinned items stay visible.",
      checked: false,
    });
    expect(model.feedItems).toEqual([
      {
        id: "jiraItems",
        label: "Work items",
        description: "Turn My activity feed on to show this.",
        checked: true,
        disabled: true,
      },
      {
        id: "gitHubActivity",
        label: "GitHub activity",
        description: "Turn My activity feed on to show this.",
        checked: true,
        disabled: true,
      },
    ]);
  });
});
