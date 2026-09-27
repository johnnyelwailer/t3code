/**
 * Story-scoped fixture data for the "PR Detail — Recipe Launch" stories.
 *
 * The data is shaped the way the real pull-request detail flow delivers it: a core
 * `PullRequestDetail` (title, checks, merge state) and an independently loaded `PullRequestActivity`
 * (comments, commits, review threads), exactly what `PullRequestDetailPanel` reads from its two
 * queries and merges. The recipe catalog below is modelled on the pr / ies-review / ies-ops skill
 * phase tables, which are the realistic candidates a surface on this pull request would offer.
 */
import type {
  EnvironmentId,
  PullRequestActivity,
  PullRequestDetail,
  PullRequestRef,
  ProjectId,
} from "@t3tools/contracts";

import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

export const STORY_ENVIRONMENT_ID = "env-story" as unknown as EnvironmentId;

const PROJECT_ID = "proj-ies" as ProjectId;

export const PR_REFERENCE: PullRequestRef = {
  projectId: PROJECT_ID,
  repository: "ies/platform-web",
  number: 1428,
};

const AUTHOR = {
  login: "p-jensen",
  name: "Pia Jensen",
  avatarUrl: "https://avatars.example/p-jensen",
};

const REVIEWER = {
  login: "a-lindgren",
  name: "Amanda Lindgren",
  avatarUrl: "https://avatars.example/a-lindgren",
};

const CI_BOT = {
  login: "ghe-ci",
  name: "GHE CI",
  avatarUrl: null,
};

/** The core detail — the fast, identity-and-state half of the read. */
export const PR_DETAIL: PullRequestDetail = {
  provider: "github",
  capabilities: {
    diff: true,
    comment: true,
    actions: ["merge"],
    mergeMethods: ["merge", "squash"],
    search: true,
    review: {
      inlineComment: true,
      reply: true,
      resolve: true,
      verdicts: ["comment", "approve", "request-changes"],
    },
    reviewers: { request: true, listCandidates: true },
  },
  viewerPermissions: {
    actions: ["merge"],
    comment: true,
    resolve: true,
    verdicts: ["comment", "approve", "request-changes"],
    requestReviewers: true,
  },
  projectId: PROJECT_ID,
  projectTitle: "IES Platform",
  workspaceRoot: "/home/dev/repos/ies-platform-web",
  repository: "ies/platform-web",
  number: 1428,
  title: "Gate the alarm acknowledgement flow behind the feature flag",
  body: [
    "## Context",
    "",
    "IES-12345: acknowledging a critical alarm must not be reachable while the alarm pipeline is",
    "mid-rollout. The gate lives behind the `alarm.acknowledgeV2` feature flag so the rollout can",
    "be reversed without touching the client.",
    "",
    "## Changes",
    "",
    "- `AlarmAcknowledgeController` checks the flag before writing the acknowledgement.",
    "- The alarm detail screen hides the acknowledge button when the flag is off.",
    "- Flag defaults move to the shared flag registry.",
    "",
    "## Test plan",
    "",
    "- Unit: the guard denies when the flag is off and records the denial reason.",
    "- E2E: the acknowledge flow on a feature environment with the flag on.",
  ].join("\n"),
  url: "https://nexplore.ghe.com/ies/platform-web/pull/1428",
  author: AUTHOR,
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 214,
  deletions: 38,
  changedFiles: 6,
  headBranch: "feature/ies-12345-alarm-flag",
  baseBranch: "develop",
  createdAt: "2026-09-08T08:12:00.000Z",
  updatedAt: "2026-09-13T15:44:00.000Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [REVIEWER],
  labels: [
    { name: "alarm", color: "#f9d024" },
    { name: "feature-flag", color: "#579aca" },
  ],
  checks: [
    { name: "Lint", status: "success", description: "eslint and stylelint", url: null },
    {
      name: "Build and test",
      status: "failure",
      description: "2 specs failing in alarm-acknowledge.spec.ts",
      url: "https://nexplore.ghe.com/ies/platform-web/actions/runs/4471",
    },
    { name: "Deploy preview", status: "pending", description: null, url: null },
  ],
  mergeCapabilities: { merge: true, squash: true, rebase: true },
  viewer: "p-jensen",
  baseComparison: "behind",
  behindBy: 3,
};

/** The conversation half — the slower read that arrives on its own. */
export const PR_ACTIVITY: PullRequestActivity = {
  author: AUTHOR,
  reviewers: [REVIEWER],
  comments: [
    {
      id: "c-review-1",
      kind: "review",
      author: REVIEWER,
      body: "Two things below — otherwise the flag plumbing looks right.",
      createdAt: "2026-09-12T09:30:00.000Z",
      url: null,
      path: null,
      reviewState: "COMMENTED",
    },
    {
      id: "c-inline-1",
      kind: "review-comment",
      author: REVIEWER,
      body: "This branch still fires when the flag is off — the guard sits one layer above it. Can you move the check into the handler so the webhook path cannot bypass it?",
      createdAt: "2026-09-12T09:31:00.000Z",
      url: null,
      path: "src/features/alarms/acknowledge.ts",
      reviewState: null,
    },
    {
      id: "c-ci-1",
      kind: "issue-comment",
      author: CI_BOT,
      body: "Build and test failed — 2 specs in `alarm-acknowledge.spec.ts` (timeout in the flag-off path).",
      createdAt: "2026-09-13T11:05:00.000Z",
      url: null,
      path: null,
      reviewState: null,
    },
    {
      id: "c-reply-1",
      kind: "issue-comment",
      author: AUTHOR,
      body: "Thanks @a-lindgren — splitting this into two commits: the guard move first, then the spec fixes.",
      createdAt: "2026-09-13T15:44:00.000Z",
      url: null,
      path: null,
      reviewState: null,
    },
  ],
  commentCount: 4,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [
    {
      oid: "9f2c1ab",
      messageHeadline: "Gate acknowledgement writes behind alarm.acknowledgeV2",
      committedDate: "2026-09-08T10:02:00.000Z",
      additions: 84,
      deletions: 12,
      authors: [AUTHOR],
    },
    {
      oid: "4d80e77",
      messageHeadline: "Hide the acknowledge button while the flag is off",
      committedDate: "2026-09-09T14:21:00.000Z",
      additions: 66,
      deletions: 9,
      authors: [AUTHOR],
    },
    {
      oid: "b1c44f0",
      messageHeadline: "Move flag defaults to the shared registry",
      committedDate: "2026-09-13T10:47:00.000Z",
      additions: 64,
      deletions: 17,
      authors: [AUTHOR],
    },
  ],
};

/**
 * The catalog a recipe surface on this pull request would offer. Titles and descriptions follow
 * the phase tables of the pr, ies-review and ies-ops skills, kept short enough for a card.
 */
export const PR_RECIPES: ReadonlyArray<T3TeamSidecarRecipeQuickStart> = [
  {
    id: "pr-watch",
    title: "Watch this PR",
    description:
      "Track CI, review state and merge readiness; act when something changes, report when it merges.",
    slashAlias: "pr-watch",
    prompt: "Watch this pull request through review to merge.",
  },
  {
    id: "pr-fix-ci",
    title: "Fix failing checks",
    description:
      "Read the failing checks, reproduce locally, fix and push; report the green run.",
    slashAlias: "pr-fix-ci",
    prompt: "Fix the failing checks on this pull request.",
  },
  {
    id: "pr-handle-comments",
    title: "Handle review comments",
    description:
      "Triage the open review remarks, address each one in the worktree, reply and resolve.",
    slashAlias: "pr-handle-comments",
    prompt: "Handle the open review comments on this pull request.",
  },
  {
    id: "pr-review",
    title: "Review this PR",
    description:
      "Full PR review: Jira traceability, acceptance-criteria coverage matrix, severity-grouped findings.",
    slashAlias: "review-pr",
    prompt: "Review this pull request with the PR review mode.",
  },
  {
    id: "pr-prep",
    title: "Prepare this draft",
    description: "Baseline checks, checklist and formatting, so the draft is ready to un-draft.",
    slashAlias: "pr-prep",
    prompt: "Prepare this pull request for review.",
  },
  {
    id: "pr-finish",
    title: "Finish after merge",
    description:
      "Version bump, ArgoCD sync and the Jira transition, once the branch lands on the base.",
    slashAlias: "pr-finish",
    prompt: "Run the post-merge finish steps for this pull request.",
  },
];
