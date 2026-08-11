import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  OrchestrationProjectShell,
  OrchestrationShellSnapshot,
  PullRequestActivity,
  PullRequestDetail,
  PullRequestDiffResult,
} from "@t3tools/contracts";

import { loadPullRequestContext } from "./t3team-github-routes-pr-context.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";

const project = {
  id: "project-1",
  title: "Acme project",
  workspaceRoot: "/workspace/acme",
  repositoryIdentity: {
    canonicalKey: "github.com/acme/project",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "git@github.com:acme/project.git",
    },
    displayName: "acme/project",
  },
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as OrchestrationProjectShell;

const shellSnapshot = {
  snapshotSequence: 1,
  projects: [project],
  threads: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as OrchestrationShellSnapshot;

const projectionLayer = Layer.succeed(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
  getShellSnapshot: () => Effect.succeed(shellSnapshot),
} as unknown as ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"]);

const detail: PullRequestDetail = {
  provider: "github",
  capabilities: {
    diff: true,
    comment: true,
    actions: [],
    mergeMethods: [],
    search: true,
    review: { inlineComment: true, reply: true, resolve: true, verdicts: [] },
    reviewers: { request: true, listCandidates: true },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: true,
    verdicts: [],
    requestReviewers: true,
  },
  projectId: "project-1" as PullRequestDetail["projectId"],
  projectTitle: "Acme project",
  workspaceRoot: "/workspace/acme",
  repository: "acme/project",
  number: 42,
  title: "Refresh context bundle",
  body: "Body text",
  url: "https://github.com/acme/project/pull/42",
  author: { login: "alex-dev", name: null, avatarUrl: null },
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  headBranch: "feature/pr-context",
  baseBranch: "main",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [],
  mergeCapabilities: { merge: true, squash: true, rebase: true },
};

const activity: PullRequestActivity = {
  comments: [
    {
      id: "review-1",
      kind: "review",
      author: { login: "reviewer", name: null, avatarUrl: null },
      body: "Looks good",
      createdAt: "2026-01-01T00:01:00.000Z",
      url: null,
      path: null,
      reviewState: "COMMENTED",
    },
    {
      id: "review-comment-1",
      kind: "review-comment",
      author: { login: "reviewer", name: null, avatarUrl: null },
      body: "Please rename this.",
      createdAt: "2026-01-01T00:02:00.000Z",
      url: null,
      path: "src/foo.ts",
      reviewState: null,
    },
    {
      id: "issue-comment-1",
      kind: "issue-comment",
      author: { login: "bystander", name: null, avatarUrl: null },
      body: "Needs rollout notes.",
      createdAt: "2026-01-01T00:03:00.000Z",
      url: null,
      path: null,
      reviewState: null,
    },
  ],
  commentCount: 3,
  commentsTruncated: false,
  reviewThreads: [
    {
      id: "thread-1",
      path: "src/foo.ts",
      line: 1,
      side: "right",
      isResolved: false,
      isOutdated: false,
      comments: [
        {
          id: "review-comment-1",
          author: { login: "reviewer", name: null, avatarUrl: null },
          body: "Please rename this.",
          createdAt: "2026-01-01T00:02:00.000Z",
          url: null,
        },
      ],
    },
  ],
  commits: [
    {
      oid: "abc1234",
      messageHeadline: "Refresh context",
      committedDate: "2026-01-01T00:00:30.000Z",
    },
  ],
};

const diff =
  "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-export const value = 'old';\n+export const value = 'new';\n";

function pullRequestServiceLayer(diffImpl?: () => Effect.Effect<PullRequestDiffResult, never>) {
  const service = PullRequestService.PullRequestService.of({
    list: () => Effect.die("not used"),
    listStats: () => Effect.die("not used"),
    detail: () => Effect.succeed(detail),
    activity: () => Effect.succeed(activity),
    diff:
      diffImpl ??
      (() =>
        Effect.succeed({
          patch: diff,
          truncated: false,
          nextCursor: null,
        } satisfies PullRequestDiffResult)),
    diffFileContents: () =>
      Effect.succeed({
        oldContents: "export const value = 'old';\n",
        newContents: "export const value = 'new';\n",
      }),
    runAction: () => Effect.die("not used"),
    comment: () => Effect.die("not used"),
    submitReview: () => Effect.die("not used"),
    replyToThread: () => Effect.die("not used"),
    setThreadResolution: () => Effect.die("not used"),
    reviewerCandidates: () => Effect.die("not used"),
    requestReviewers: () => Effect.die("not used"),
    invalidate: () => Effect.void,
  });
  return Layer.succeed(PullRequestService.PullRequestService, service);
}

describe("loadPullRequestContext", () => {
  it("loads a complete pull request package including diff, comments, and snapshots", async () => {
    const result = await Effect.runPromise(
      loadPullRequestContext({
        host: "github.com",
        repository: "acme/project",
        subjectUrl: "https://github.com/acme/project/pull/42",
      }).pipe(Effect.provide(Layer.merge(pullRequestServiceLayer(), projectionLayer))),
    );

    expect(result.pullRequestNumber).toBe(42);
    expect(result.diff).toContain("diff --git a/src/foo.ts b/src/foo.ts");
    expect(result.reviews).toHaveLength(1);
    expect(result.reviewComments).toHaveLength(1);
    expect(result.reviewComments[0]?.line).toBe(1);
    expect(result.issueComments).toHaveLength(1);
    expect(result.commits).toHaveLength(1);
    expect(result.files).toHaveLength(1);
    expect(result.fileSnapshots[0]?.base?.contents).toContain("old");
    expect(result.fileSnapshots[0]?.head?.contents).toContain("new");
  });

  it("fails when no project checkout is bound to the repository", async () => {
    const emptyProjectionLayer = Layer.succeed(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
      getShellSnapshot: () =>
        Effect.succeed({ ...shellSnapshot, projects: [] } as unknown as OrchestrationShellSnapshot),
    } as unknown as ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"]);

    const outcome = await Effect.runPromise(
      Effect.exit(
        loadPullRequestContext({
          host: "github.com",
          repository: "acme/other-project",
          subjectUrl: "https://github.com/acme/other-project/pull/99",
        }).pipe(Effect.provide(Layer.merge(pullRequestServiceLayer(), emptyProjectionLayer))),
      ),
    );

    expect(outcome._tag).toBe("Failure");
    expect(JSON.stringify(outcome)).toContain("No open project checkout is bound to");
  });

  it("fails instead of looping forever when diff pagination repeats the same cursor", async () => {
    const diffCalls: Array<string | undefined> = [];
    const repeatingDiff = () =>
      Effect.sync(() => {
        // Every page hands back the same cursor, as a provider bug might: the loop must
        // detect the repeat rather than appending this patch forever.
        diffCalls.push("stuck-cursor");
        return {
          patch: "diff --git a/src/foo.ts b/src/foo.ts\n@@ -1 +1 @@\n-a\n+b\n",
          truncated: true,
          nextCursor: "stuck-cursor",
        } satisfies PullRequestDiffResult;
      });

    const outcome = await Effect.runPromise(
      Effect.exit(
        loadPullRequestContext({
          host: "github.com",
          repository: "acme/project",
          subjectUrl: "https://github.com/acme/project/pull/7",
        }).pipe(
          Effect.provide(Layer.merge(pullRequestServiceLayer(repeatingDiff), projectionLayer)),
        ),
      ),
    );

    expect(outcome._tag).toBe("Failure");
    expect(JSON.stringify(outcome)).toContain("repeated cursor");
    // Once for the first page, once more to notice the cursor repeats — never unbounded.
    expect(diffCalls.length).toBe(2);
  });
});
