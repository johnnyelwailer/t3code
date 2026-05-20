import type { GitHubPullRequestContextResponse } from "./t3work-githubTypes";
import type { GitHubBackendApi, GitHubInboxDiscoverResponse } from "./t3work-types";

const TRANSPARENT_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUs8AAAAASUVORK5CYII=";

function nowIso(): string {
  return new Date().toISOString();
}

function buildMockInboxResponse(host: string): GitHubInboxDiscoverResponse {
  const now = nowIso();
  return {
    host,
    account: "mock-user",
    repositories: [
      {
        id: "repo-1",
        nameWithOwner: "acme/platform",
        url: "https://github.com/acme/platform",
        host,
        updatedAt: now,
        description: "Main platform repository",
        isPrivate: true,
      },
    ],
    inboxItems: [
      {
        id: "notif-1",
        repository: "acme/platform",
        repositoryUrl: "https://github.com/acme/platform",
        reason: "mention",
        authorLogin: "alex-dev",
        reviewRequested: true,
        subjectType: "PullRequest",
        subjectTitle: "Upgrade build pipeline",
        subjectUrl: "https://github.com/acme/platform/pull/42",
        subjectBranch: "feature/ACME-42-upgrade-build-pipeline",
        subjectState: "open",
        updatedAt: now,
      },
    ],
    suggestedRepositoryUrls: ["https://github.com/acme/platform"],
  };
}

function buildMockPullRequestContext(
  host: string,
  repository: string,
): GitHubPullRequestContextResponse {
  const now = nowIso();
  return {
    host,
    repository,
    pullRequestNumber: 42,
    capturedAt: now,
    pullRequest: {
      id: 42,
      number: 42,
      title: "Upgrade build pipeline",
      state: "open",
      html_url: "https://github.com/acme/platform/pull/42",
      body: "## Summary\n\nUpgrades the build pipeline.\n\n![Pipeline diagram](https://images.example.test/pipeline-diagram.png)",
      body_text: "Summary\n\nUpgrades the build pipeline.",
      body_html:
        '<h2>Summary</h2><p>Upgrades the build pipeline.</p><p><img src="https://images.example.test/pipeline-diagram.png" alt="Pipeline diagram"></p>',
      created_at: now,
      updated_at: now,
      comments: 1,
      review_comments: 1,
      additions: 12,
      deletions: 4,
      changed_files: 1,
      commits: 1,
      user: { login: "alex-dev" },
      base: { ref: "main", sha: "base-sha" },
      head: { ref: "feature/ACME-42-upgrade-build-pipeline", sha: "head-sha" },
    },
    files: [
      {
        filename: "src/build/pipeline.ts",
        status: "modified",
        additions: 12,
        deletions: 4,
        changes: 16,
        patch: "@@ -1 +1 @@\n-export const pipeline = 'old';\n+export const pipeline = 'new';",
      },
    ],
    reviews: [
      {
        id: 100,
        state: "COMMENTED",
        body: "Looks good overall.",
        body_text: "Looks good overall.",
        user: { login: "reviewer-1" },
      },
    ],
    reviewComments: [
      {
        id: 101,
        path: "src/build/pipeline.ts",
        line: 12,
        body: "Please simplify this branch.",
        body_text: "Please simplify this branch.",
        diff_hunk: "@@ -10,3 +10,3 @@",
        user: { login: "reviewer-1" },
      },
    ],
    issueComments: [
      {
        id: 102,
        body: "Can we add rollout notes?\n\n![Rollout notes](https://images.example.test/rollout-notes.png)",
        body_text: "Can we add rollout notes?",
        body_html:
          '<p>Can we add rollout notes?</p><p><img src="https://images.example.test/rollout-notes.png" alt="Rollout notes"></p>',
        user: { login: "pm-1" },
      },
    ],
    commits: [
      {
        sha: "abc123def456",
        commit: {
          message: "Upgrade build pipeline",
          author: { name: "Alex Dev", date: now },
        },
        author: { login: "alex-dev" },
      },
    ],
    fileSnapshots: [
      {
        path: "src/build/pipeline.ts",
        status: "modified",
        base: {
          path: "src/build/pipeline.ts",
          ref: "base-sha",
          encoding: "utf8",
          contents: "export const pipeline = 'old';\n",
          sizeBytes: 31,
        },
        head: {
          path: "src/build/pipeline.ts",
          ref: "head-sha",
          encoding: "utf8",
          contents: "export const pipeline = 'new';\n",
          sizeBytes: 31,
        },
      },
    ],
    diff: "diff --git a/src/build/pipeline.ts b/src/build/pipeline.ts\n--- a/src/build/pipeline.ts\n+++ b/src/build/pipeline.ts\n@@ -1 +1 @@\n-export const pipeline = 'old';\n+export const pipeline = 'new';\n",
  };
}

export function createMockGitHubBackendApi(): GitHubBackendApi {
  return {
    discoverInbox: async (input) => buildMockInboxResponse(input.host),
    getPullRequestContext: async (input) =>
      buildMockPullRequestContext(input.host, input.repository),
    downloadAsset: async () => ({
      base64Contents: TRANSPARENT_PIXEL_PNG_BASE64,
      mimeType: "image/png",
      sizeBytes: 68,
    }),
  };
}
