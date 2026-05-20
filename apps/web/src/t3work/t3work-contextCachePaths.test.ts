import { describe, expect, it } from "vitest";

import {
  buildContextManifestPath,
  buildGitHubActivityCacheRoot,
  buildGitHubActivityEntryPoint,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  buildJiraTicketFocusEntryPoint,
  buildProjectContextCacheRoot,
  buildProjectContextEntryPoint,
} from "~/t3work/t3work-contextCachePaths";

describe("t3work context cache paths", () => {
  it("creates stable shared roots for project and ticket context", () => {
    expect(buildProjectContextCacheRoot("Project Alpha")).toBe(".t3work/context");
    expect(buildProjectContextEntryPoint("Project Alpha")).toBe(".t3work/context/entrypoint.json");

    expect(buildJiraTicketCacheRoot("Project Alpha", "IES-17820")).toBe(
      ".t3work/context/jira/project-alpha/items/ies-17820",
    );
    expect(buildJiraTicketEntryPoint("Project Alpha", "IES-17820")).toBe(
      ".t3work/context/jira/project-alpha/items/ies-17820/entrypoint.json",
    );
    expect(
      buildJiraTicketFocusEntryPoint({
        projectId: "Project Alpha",
        ticketKey: "IES-17820",
        focus: "Sent requests / comments",
      }),
    ).toBe(".t3work/context/jira/project-alpha/items/ies-17820/focus/sent-requests-comments.json");
  });

  it("sanitizes github cache roots without duplicating repository separators", () => {
    const root = buildGitHubActivityCacheRoot({
      projectId: "Project Alpha",
      repository: "foo/bar_baz",
      activityId: "PR-123 review_requested",
    });

    expect(root).toBe(".t3work/context/github/project-alpha/foo-bar-baz/pr-123-review-requested");
    expect(
      buildGitHubActivityEntryPoint({
        projectId: "Project Alpha",
        repository: "foo/bar_baz",
        activityId: "PR-123 review_requested",
      }),
    ).toBe(`${root}/entrypoint.json`);
    expect(buildContextManifestPath(root)).toBe(`${root}/manifest.json`);
  });
});
