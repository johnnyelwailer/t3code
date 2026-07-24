import { describe, expect, it } from "vite-plus/test";

import {
  getGitHubActivityItemsForWorkItem,
  groupGitHubActivityByWorkItem,
  type GitHubWorkActivityItem,
} from "./t3team-githubActivity";

describe("github activity", () => {
  it("matches work item activity case-insensitively", () => {
    const items: ReadonlyArray<GitHubWorkActivityItem> = [
      {
        id: "gh-1",
        repository: "repo",
        reason: "review_requested",
        workItemKey: "IES-9242",
      },
    ];

    const grouped = groupGitHubActivityByWorkItem(items);

    expect(getGitHubActivityItemsForWorkItem(grouped, "IES-9242")).toHaveLength(1);
    expect(getGitHubActivityItemsForWorkItem(grouped, "ies-9242")).toHaveLength(1);
  });

  it("keeps linked pull requests ahead of newer non-PR notifications", () => {
    const grouped = groupGitHubActivityByWorkItem([
      {
        id: "gh-build",
        repository: "repo",
        reason: "ci_activity",
        subjectTitle: "Build failed on main",
        updatedAt: "2026-05-26T12:00:00.000Z",
        workItemKey: "IES-9242",
      },
      {
        id: "gh-pr",
        repository: "repo",
        reason: "pull request",
        subjectType: "PullRequest",
        subjectTitle: "IES-9242 Add linked PR visibility",
        subjectState: "merged",
        updatedAt: "2026-05-25T12:00:00.000Z",
        workItemKey: "IES-9242",
      },
    ]);

    expect(getGitHubActivityItemsForWorkItem(grouped, "IES-9242").map((item) => item.id)).toEqual([
      "gh-pr",
      "gh-build",
    ]);
  });
});
