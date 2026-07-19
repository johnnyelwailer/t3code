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
});
