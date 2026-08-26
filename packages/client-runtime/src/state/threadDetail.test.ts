import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentThreadShell } from "./models.ts";
import { mergeEnvironmentThread } from "./threadDetail.ts";

type MergedDetail = NonNullable<Parameters<typeof mergeEnvironmentThread>[0]>;

const shell = {
  environmentId: EnvironmentId.make("local"),
  id: ThreadId.make("thread-child"),
  projectId: ProjectId.make("project-1"),
  title: "New child",
  modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "qwen" },
  runtimeMode: "full-access",
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
} satisfies EnvironmentThreadShell;

describe("mergeEnvironmentThread", () => {
  it("exposes shell-only threads while their detail stream loads", () => {
    expect(mergeEnvironmentThread(null, shell)).toEqual(
      expect.objectContaining({
        id: "thread-child",
        title: "New child",
        messages: [],
        activities: [],
      }),
    );
  });

  // The live/ephemeral fields must track the shell, not the cached detail:
  // a thread that was opened at least once has a cached detail snapshot, and
  // while its detail stream is quiet that cache must not shadow the fresher
  // shell values that arrive on every `thread-upserted` event. This is what
  // kept the active-children indicator's labels (and background liveness)
  // stale on opened children (GHE #52 / #201 follow-up).
  it("keeps live shell fields authoritative over a stale cached detail", () => {
    const liveShell: EnvironmentThreadShell = {
      ...shell,
      activityLabel: "Refactoring auth flow",
      activityLabelUpdatedAt: "2026-07-19T08:05:00.000Z",
      activityState: "working",
      activityStateUpdatedAt: "2026-07-19T08:05:00.000Z",
      childStatus: "Refactoring auth flow",
      childStatusUpdatedAt: "2026-07-19T08:05:00.000Z",
      backgroundLiveness: "working",
      planProgress: { step: "Rewrite session store", completedSteps: 2, totalSteps: 7 },
      sleepingUntil: "2026-07-19T09:00:00.000Z",
    };
    const staleDetail = {
      ...shell,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      // Stale cached values from the last time the detail stream pushed.
      activityLabel: "Old label from cached detail",
      activityLabelUpdatedAt: "2026-07-19T07:00:00.000Z",
      activityState: null,
      activityStateUpdatedAt: null,
      childStatus: "Old child status",
      childStatusUpdatedAt: "2026-07-19T07:00:00.000Z",
      // Detail carries no backgroundLiveness/planProgress at all.
    } as unknown as MergedDetail;

    const merged = mergeEnvironmentThread(staleDetail, liveShell)!;
    expect(merged).toEqual(
      expect.objectContaining({
        activityLabel: "Refactoring auth flow",
        activityLabelUpdatedAt: "2026-07-19T08:05:00.000Z",
        activityState: "working",
        activityStateUpdatedAt: "2026-07-19T08:05:00.000Z",
        childStatus: "Refactoring auth flow",
        childStatusUpdatedAt: "2026-07-19T08:05:00.000Z",
        backgroundLiveness: "working",
        planProgress: { step: "Rewrite session store", completedSteps: 2, totalSteps: 7 },
        sleepingUntil: "2026-07-19T09:00:00.000Z",
      }),
    );
  });

  it("keeps cached detail values when the shell lacks a live field (old-server interop)", () => {
    const liveShell: EnvironmentThreadShell = { ...shell, activityLabel: null };
    const cachedDetail = {
      ...shell,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      childStatus: "Cached summary",
    } as unknown as MergedDetail;

    const merged = mergeEnvironmentThread(cachedDetail, liveShell)!;
    expect(merged.childStatus).toBe("Cached summary");
    expect(merged.activityLabel).toBeNull();
  });
});
