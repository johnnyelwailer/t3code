/**
 * Fixture data for the PR-watch stories and tests, shaped like what the selectors produce from
 * real shells and facts. One place, so a story and a test that disagree are a fixture bug, not
 * two truths.
 */
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type OrchestrationWorkflowRunStatus,
  type T3TeamRecipeSummaryFact,
  type ThreadPullRequestLink,
} from "@t3tools/contracts";

import type { RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { watchedPullRequestKey } from "~/state/t3team-watchedPullRequests";
import type {
  WatchedPullRequestsByKey,
  WatchedPullRequestWatcher,
} from "~/state/t3team-watchedPullRequests.logic";

export const FIXTURE_ENVIRONMENT_ID = EnvironmentId.make("env-fixture");
export const FIXTURE_PROJECT_ID = ProjectId.make("project-nexi");
export const FIXTURE_HOST = "nexplore.ghe.com";
const NOW = "2026-10-08T09:30:00.000Z";

export function fixtureLink(input: {
  repository: string;
  number: number;
  title: string;
  host?: string;
  state?: "open" | "merged" | "closed";
  watched?: boolean;
}): ThreadPullRequestLink {
  const host = input.host ?? FIXTURE_HOST;
  return {
    host,
    repository: input.repository,
    number: input.number,
    url: `https://${host}/${input.repository}/pull/${input.number}`,
    source: "agent",
    linkedAt: "2026-10-07T08:00:00.000Z",
    snapshot: {
      state: input.state ?? "open",
      title: input.title,
      headBranch: `pj/pr-${input.number}`,
      baseBranch: "main",
      isDraft: false,
      updatedAt: NOW,
      syncedAt: NOW,
    },
    stack: null,
    ...(input.watched === false
      ? {}
      : {
          watch: {
            startedAt: "2026-10-07T08:05:00.000Z",
            headSha: "a1b2c3d",
            failedChecks: [],
            passed: false,
            passedChecks: [],
            remarksThrough: NOW,
            remarkIds: [],
            conflicting: false,
            wakes: 2,
          },
        }),
  };
}

type WatcherInput = Partial<Omit<WatchedPullRequestWatcher, "link" | "threadRef">> & {
  threadId: string;
  link: ThreadPullRequestLink;
};

export function fixtureWatcher(input: WatcherInput): WatchedPullRequestWatcher {
  const { threadId, link, ...rest } = input;
  return {
    threadRef: { environmentId: FIXTURE_ENVIRONMENT_ID, threadId: ThreadId.make(threadId) },
    threadTitle: `Babysit #${link.number} · ${link.snapshot?.title ?? link.repository}`,
    projectId: FIXTURE_PROJECT_ID,
    link,
    tone: "quiet",
    statusLabel: "Waiting",
    runtimeMode: "full-access",
    activityLabel: null,
    workingSince: null,
    recipeId: "pr-watch",
    prWatch: {
      ownership: { verdict: "own", source: "pr-watch/ownership" },
      merge: { mode: "manual", source: "hive-policies/merge" },
      model: "Conductor",
    },
    hasPendingUserInput: false,
    ...rest,
  };
}

export const LINK_412 = fixtureLink({
  repository: "hive/nx-nexi",
  number: 412,
  title: "Scope filter for tickets",
});
export const LINK_377 = fixtureLink({
  repository: "johnnyelwailer/t3code",
  number: 377,
  title: "Theme tokens",
});
export const LINK_398 = fixtureLink({
  repository: "hive/nx-nexi",
  number: 398,
  title: "Lane store",
});
export const LINK_401 = fixtureLink({
  repository: "hive/nx-nexi",
  number: 401,
  title: "Docs typo",
  state: "merged",
  watched: false,
});

export const WATCHER_412_FIXING = fixtureWatcher({
  threadId: "thread-412",
  link: LINK_412,
  tone: "working",
  statusLabel: "Working",
  activityLabel: "Fixing lint on a1b2c3d",
  workingSince: "2026-10-08T09:26:00.000Z",
});
export const WATCHER_412_NEEDS_YOU = fixtureWatcher({
  threadId: "thread-412",
  link: LINK_412,
  tone: "needs-you",
  statusLabel: "Awaiting Input",
  hasPendingUserInput: true,
  prWatch: {
    ownership: { verdict: "own", source: "pr-watch/ownership" },
    note: "Product call: empty-state copy when no tickets match.",
  },
});
export const WATCHER_377_UNSURE = fixtureWatcher({
  threadId: "thread-377",
  link: LINK_377,
  tone: "needs-you",
  statusLabel: "Awaiting Input",
  runtimeMode: "approval-required",
  hasPendingUserInput: true,
  prWatch: {
    ownership: { verdict: "unsure", source: "pr-watch/ownership" },
    note: "Treat #377 as yours?",
  },
});
export const WATCHER_377_THREAD = fixtureWatcher({
  threadId: "thread-theme-tokens",
  link: LINK_377,
  threadTitle: "Theme tokens follow-up",
  runtimeMode: "approval-required",
  recipeId: null,
  prWatch: null,
});
export const WATCHER_398_PARKED = fixtureWatcher({
  threadId: "thread-398",
  link: LINK_398,
  tone: "attention",
  statusLabel: "Parked",
  prWatch: {
    ownership: { verdict: "own", source: "pr-watch/ownership" },
    parked: { reason: "Nexplore unreachable · Claude at its weekly limit until Mon 03:00" },
  },
});

export function fixtureWatchedByKey(
  watchers: ReadonlyArray<WatchedPullRequestWatcher>,
): WatchedPullRequestsByKey {
  const byKey = new Map<string, Array<WatchedPullRequestWatcher>>();
  for (const watcher of watchers) {
    const key = watchedPullRequestKey(watcher.link);
    byKey.set(key, [...(byKey.get(key) ?? []), watcher]);
  }
  return byKey;
}

export const WATCHED_FIXTURE = fixtureWatchedByKey([
  WATCHER_412_FIXING,
  WATCHER_377_UNSURE,
  WATCHER_377_THREAD,
  WATCHER_398_PARKED,
]);

export function fixtureRunStatus(
  status: OrchestrationWorkflowRunStatus["status"],
): OrchestrationWorkflowRunStatus {
  return {
    runId: "run-pr-watch",
    status,
    pendingKind: null,
    wakeAt: null,
    updatedAt: "2026-10-08T09:21:00.000Z",
  };
}

type SummaryInput = {
  readonly watched?: number;
  readonly counts?: ReadonlyArray<{ id: string; label: string; value: number }>;
  readonly detail?: string | null;
  readonly warnings?: T3TeamRecipeSummaryFact["warnings"];
};

/** A `T3TeamRecipeSummaryFact` as the pr-watch pass writes it: `watched` first, then its own. */
export function fixtureSummary(input: SummaryInput = {}): T3TeamRecipeSummaryFact {
  return {
    counts: [
      { id: "watched", label: "PRs watched", value: input.watched ?? 12 },
      ...(input.counts ?? []),
    ],
    ...(input.detail === null ? {} : { detail: input.detail ?? "Conductor · this Mac" }),
    warnings: input.warnings ?? [],
    updatedAt: "2026-10-08T09:20:00.000Z",
  };
}

export function fixtureRun(input: {
  status: OrchestrationWorkflowRunStatus["status"] | null;
  summary?: SummaryInput | null;
  activityLabel?: string;
  watchThreads?: ReadonlyArray<WatchedPullRequestWatcher>;
}): RecipeRunSnapshot {
  return {
    home:
      input.status === null
        ? null
        : {
            threadRef: {
              environmentId: FIXTURE_ENVIRONMENT_ID,
              threadId: ThreadId.make("thread-pr-watch-home"),
            },
            title: "Watch my PRs",
            workflowRunStatus: fixtureRunStatus(input.status),
            activityLabel: input.activityLabel ?? null,
            summary: input.summary === null ? null : fixtureSummary(input.summary ?? {}),
          },
    watchThreads: input.watchThreads ?? [],
  };
}

export const RUN_OFF = fixtureRun({ status: null });
export const RUN_STARTING = fixtureRun({
  status: "running",
  summary: null,
  activityLabel: "finding your PRs on 3 repos…",
});
export const RUN_QUIET = fixtureRun({ status: "sleeping" });
export const RUN_NEEDS_YOU = fixtureRun({
  status: "sleeping",
  summary: { counts: [{ id: "parked", label: "parked", value: 1 }] },
  watchThreads: [WATCHER_412_NEEDS_YOU, WATCHER_377_UNSURE, WATCHER_398_PARKED, WATCHER_412_FIXING],
});
export const RUN_FALLBACK = fixtureRun({
  status: "sleeping",
  summary: {
    warnings: [
      {
        kind: "fallback",
        text: "Nexplore unreachable · fixes run on Claude Sonnet 5.5 until it is back",
      },
    ],
  },
});
export const RUN_CONFIG_WARNING = fixtureRun({
  status: "sleeping",
  summary: {
    counts: [{ id: "needs-you", label: "need you", value: 1 }],
    warnings: [
      {
        kind: "config",
        key: "mergePolicy",
        file: "pr-watch.config.ts",
        line: 9,
        text: "hive-policies/merge: output field mode missing, using the pack default",
      },
    ],
  },
  watchThreads: [WATCHER_412_NEEDS_YOU],
});
export const RUN_SIGN_IN = fixtureRun({
  status: "sleeping",
  summary: {
    watched: 4,
    counts: [{ id: "unreadable", label: "unreadable", value: 8 }],
    warnings: [
      { kind: "sign-in", text: "Not signed in to nexplore.ghe.com · 8 PRs cannot be read" },
    ],
  },
});
export const RUN_FAILED = fixtureRun({
  status: "failed",
  watchThreads: [WATCHER_412_FIXING],
});
