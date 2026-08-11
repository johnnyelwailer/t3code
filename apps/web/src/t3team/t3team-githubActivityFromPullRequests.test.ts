import { describe, expect, it } from "vite-plus/test";
import type { PullRequestListEntry } from "@t3tools/contracts";
import { toGitHubWorkActivityItemsFromPullRequestEntries } from "./t3team-githubActivityFromPullRequests";

function entry(overrides: Partial<PullRequestListEntry>): PullRequestListEntry {
  return {
    provider: "github",
    host: "github.com",
    projectId: "project-1" as PullRequestListEntry["projectId"],
    projectTitle: "Acme project",
    repository: "acme/project",
    number: 42,
    title: "PROJ-123 Refresh context bundle",
    url: "https://github.com/acme/project/pull/42",
    author: { login: "alex-dev", name: null, avatarUrl: null },
    headBranch: "feature/pr-context",
    baseBranch: "main",
    state: "open",
    isDraft: false,
    mergeability: "mergeable",
    additions: 10,
    deletions: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    viewerReviewRequested: false,
    labels: [],
    ...overrides,
  };
}

describe("toGitHubWorkActivityItemsFromPullRequestEntries", () => {
  it("maps a listing row to a work activity item and extracts its work item key", () => {
    const [item] = toGitHubWorkActivityItemsFromPullRequestEntries([entry({})]);

    expect(item).toMatchObject({
      repository: "acme/project",
      subjectType: "PullRequest",
      subjectTitle: "PROJ-123 Refresh context bundle",
      subjectUrl: "https://github.com/acme/project/pull/42",
      subjectBranch: "feature/pr-context",
      subjectState: "open",
      authorLogin: "alex-dev",
      workItemKey: "PROJ-123",
    });
  });

  it("reports a draft row's subjectState as draft regardless of its open/closed state", () => {
    const [item] = toGitHubWorkActivityItemsFromPullRequestEntries([entry({ isDraft: true })]);
    expect(item?.subjectState).toBe("draft");
  });

  it("marks review-requested rows so they sort ahead of the rest", () => {
    const items = toGitHubWorkActivityItemsFromPullRequestEntries([
      entry({
        title: "No ticket here",
        viewerReviewRequested: false,
        updatedAt: "2026-01-01T00:02:00.000Z",
      }),
      entry({
        number: 43,
        title: "PROJ-9 needs review",
        viewerReviewRequested: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(items[0]?.reviewRequested).toBe(true);
  });

  it("falls back to the branch and repository when the title carries no ticket key", () => {
    const [item] = toGitHubWorkActivityItemsFromPullRequestEntries([
      entry({ title: "Untitled change", headBranch: "PROJ-77-cleanup" }),
    ]);
    expect(item?.workItemKey).toBe("PROJ-77");
  });
});
