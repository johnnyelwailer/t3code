import { describe, expect, it } from "vite-plus/test";
import {
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
} from "@t3tools/project-context/t3teamContextPaths";

import {
  buildContextManifestPath,
  buildGitHubActivityCacheRoot,
  buildGitHubActivityEntryPoint,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  buildJiraTicketFocusEntryPoint,
  buildProjectContextCacheRoot,
  buildProjectContextEntryPoint,
} from "~/t3team/t3team-contextCachePaths";

describe("t3team context cache paths", () => {
  it("creates stable shared roots for project and ticket context", () => {
    expect(buildProjectContextCacheRoot("Project Alpha")).toBe(T3TEAM_PROJECT_CONTEXT_ROOT);
    expect(buildProjectContextEntryPoint("Project Alpha")).toBe(T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH);

    expect(buildJiraTicketCacheRoot("Project Alpha", "IES-17820")).toBe(
      `${T3TEAM_PROJECT_CONTEXT_ROOT}/jira/project-alpha/items/ies-17820`,
    );
    expect(buildJiraTicketEntryPoint("Project Alpha", "IES-17820")).toBe(
      `${T3TEAM_PROJECT_CONTEXT_ROOT}/jira/project-alpha/items/ies-17820/entrypoint.json`,
    );
    expect(
      buildJiraTicketFocusEntryPoint({
        projectId: "Project Alpha",
        ticketKey: "IES-17820",
        focus: "Sent requests / comments",
      }),
    ).toBe(`${T3TEAM_PROJECT_CONTEXT_ROOT}/jira/project-alpha/items/ies-17820/focus/sent-requests-comments.json`);
  });

  it("sanitizes github cache roots without duplicating repository separators", () => {
    const root = buildGitHubActivityCacheRoot({
      projectId: "Project Alpha",
      repository: "foo/bar_baz",
      activityId: "PR-123 review_requested",
    });

    expect(root).toBe(`${T3TEAM_PROJECT_CONTEXT_ROOT}/github/project-alpha/foo-bar-baz/pr-123-review-requested`);
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
