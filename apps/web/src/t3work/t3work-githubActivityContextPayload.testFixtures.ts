import type { ProjectShellProject } from "@t3tools/project-context";

import type { GitHubPullRequestContextResponse } from "~/t3work/backend/t3work-githubTypes";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function createProject(): ProjectShellProject {
  return {
    id: "Project Alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "proj-1",
      externalProjectKey: "PROJ",
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-18T00:00:00.000Z",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

export function createTicket(): ProjectTicket {
  return {
    id: "proj-7",
    projectId: "Project Alpha",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: "PROJ-7",
      displayId: "PROJ-7",
      title: "Investigate context sync",
      type: "Bug",
      url: "https://example.test/browse/PROJ-7",
      projectId: "PROJ",
    },
    issueType: "Bug",
    status: "In Progress",
    updatedAt: "2026-05-18T12:00:00.000Z",
  };
}

export function createActivity(): GitHubWorkActivityItem {
  return {
    id: "pr-42",
    repository: "example/project-alpha",
    repositoryUrl: "https://github.com/example/project-alpha",
    reason: "review_requested",
    subjectType: "PullRequest",
    subjectTitle: "Fix context sync",
    subjectState: "open",
    authorLogin: "pj",
  };
}

export function createPullRequestContext(): GitHubPullRequestContextResponse {
  return {
    host: "github.com",
    repository: "example/project-alpha",
    pullRequestNumber: 42,
    capturedAt: "2026-05-19T20:00:00.000Z",
    pullRequest: {
      number: 42,
      title: "Fix context sync",
      state: "open",
      html_url: "https://github.com/example/project-alpha/pull/42",
      body: "## Summary\n\nBundles the complete PR context.",
      body_html: "<h2>Summary</h2><p>Bundles the complete PR context.</p>",
      user: { login: "pj" },
      base: { ref: "main", sha: "base-sha" },
      head: { ref: "feature/pr-context", sha: "head-sha" },
    },
    files: [
      {
        filename: "src/context.ts",
        status: "modified",
        additions: 8,
        deletions: 2,
        changes: 10,
        patch: "@@ -1 +1 @@\n-old\n+new",
      },
    ],
    reviews: [{ id: 1, state: "COMMENTED", body: "Looks good." }],
    reviewComments: [{ id: 2, path: "src/context.ts", line: 4, body: "Please rename this." }],
    issueComments: [{ id: 3, body: "Can you add notes?" }],
    commits: [{ sha: "abc1234", commit: { message: "Fix context sync" } }],
    fileSnapshots: [
      {
        path: "src/context.ts",
        status: "modified",
        base: {
          path: "src/context.ts",
          ref: "base-sha",
          encoding: "utf8",
          contents: "export const oldValue = true;\n",
        },
        head: {
          path: "src/context.ts",
          ref: "head-sha",
          encoding: "utf8",
          contents: "export const newValue = true;\n",
        },
      },
    ],
    diff: "diff --git a/src/context.ts b/src/context.ts",
  };
}
