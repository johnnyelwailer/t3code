import { describe, expect, it } from "vite-plus/test";

import {
  extractWorkItemKey,
  getGitHubActivityItemsForWorkItem,
  groupGitHubActivityByWorkItem,
  resolveGitHubWorkItemKey,
} from "./t3team-githubActivity.ts";

describe("extractWorkItemKey", () => {
  it("matches a project-prefix + dash + number key case-insensitively", () => {
    expect(extractWorkItemKey("IES-9242 Add linked PR visibility")).toBe("IES-9242");
    expect(extractWorkItemKey("fix: ies-9242 broken build")).toBe("IES-9242");
  });

  it("returns undefined when no key is present", () => {
    expect(extractWorkItemKey("Refactor internals")).toBeUndefined();
    expect(extractWorkItemKey(undefined)).toBeUndefined();
  });
});

describe("resolveGitHubWorkItemKey", () => {
  it("prefers the title over the branch and the repository", () => {
    expect(
      resolveGitHubWorkItemKey({
        subjectTitle: "ABC-123 something",
        subjectBranch: "feature/xyz-999",
        repository: "acme/qrs-1",
      }),
    ).toBe("ABC-123");
  });

  it("falls back to the branch, then the repository, when the title has no key", () => {
    expect(
      resolveGitHubWorkItemKey({
        subjectTitle: "No key here",
        subjectBranch: "feature/xyz-999",
        repository: "acme/qrs-1",
      }),
    ).toBe("XYZ-999");
    expect(
      resolveGitHubWorkItemKey({
        subjectTitle: "No key here",
        subjectBranch: "chore/cleanup",
        repository: "acme/qrs-1",
      }),
    ).toBe("QRS-1");
  });

  it("resolves undefined when no source carries a key", () => {
    expect(
      resolveGitHubWorkItemKey({
        subjectTitle: "Refactor internals",
        subjectBranch: "chore/cleanup",
        repository: "acme/project",
      }),
    ).toBeUndefined();
  });
});

describe("groupGitHubActivityByWorkItem / getGitHubActivityItemsForWorkItem", () => {
  it("matches work item activity case-insensitively", () => {
    const grouped = groupGitHubActivityByWorkItem([{ id: "gh-1", workItemKey: "IES-9242" }]);

    expect(getGitHubActivityItemsForWorkItem(grouped, "IES-9242")).toHaveLength(1);
    expect(getGitHubActivityItemsForWorkItem(grouped, "ies-9242")).toHaveLength(1);
  });

  it("keeps linked pull requests ahead of newer non-PR notifications", () => {
    const grouped = groupGitHubActivityByWorkItem([
      {
        id: "gh-build",
        subjectTitle: "Build failed on main",
        updatedAt: "2026-05-26T12:00:00.000Z",
        workItemKey: "IES-9242",
      },
      {
        id: "gh-pr",
        subjectType: "PullRequest",
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
