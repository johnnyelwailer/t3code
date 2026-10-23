/**
 * Which My Work kickoffs send at click time: only a plain-text send, and only while
 * `MYWORK_KICKOFF_SEND_NOW` is on. Everything else keeps the two-phase kickoff, where the thread's
 * chat sends when it mounts.
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import type { ProjectThread } from "~/t3team/t3team-types";
import { createProjectKickoffThread } from "~/t3team/t3team-useAppHandlers-kickoffThread";

const serverState = vi.hoisted(() => ({
  config: null as { featureFlags: Record<string, boolean> } | null,
}));
vi.mock("~/t3team/t3team-serverState", () => ({
  readPrimaryServerConfig: () => serverState.config,
  useServerConfig: () => serverState.config,
}));

const PROJECT_ID = "project-1";

const createdThread: ProjectThread = {
  id: "thread-1",
  projectId: PROJECT_ID,
  title: "Project kickoff",
  lastMessageAt: "2026-10-23T00:00:00.000Z",
  createdAt: "2026-10-23T00:00:00.000Z",
  status: "idle",
  kickoffMessage: "What is blocking my sprint?",
  kickoffPending: true,
};

const store = {
  resolveProjectId: (projectId: string) => projectId,
  createThread: vi.fn(() => createdThread),
};
const onOpenDashboard = vi.fn();
const sendKickoffAtClick = vi.fn(() => true);

function kickoff(overrides: Partial<ProjectKickoffThreadInput>) {
  return createProjectKickoffThread(
    {
      projectId: PROJECT_ID,
      dashboardMode: "my-work",
      kickoffMessage: "What is blocking my sprint?",
      kickoffModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      selectedToolIds: [],
      kickoffContextAttachments: [],
      ...overrides,
    },
    { store, onOpenDashboard, sendKickoffAtClick },
  );
}

describe("createProjectKickoffThread", () => {
  beforeEach(() => {
    serverState.config = null;
    vi.clearAllMocks();
  });

  it("sends a plain-text kickoff at click time and still opens the thread", () => {
    kickoff({ sendAtClick: true });

    expect(sendKickoffAtClick).toHaveBeenCalledWith(createdThread);
    expect(onOpenDashboard).toHaveBeenCalledWith(PROJECT_ID, "my-work", "thread-1");
  });

  it("keeps the two-phase kickoff while the flag is off", () => {
    serverState.config = { featureFlags: { MYWORK_KICKOFF_SEND_NOW: false } };

    kickoff({ sendAtClick: true });

    expect(sendKickoffAtClick).not.toHaveBeenCalled();
    expect(store.createThread).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ kickoffPending: true }),
    );
    expect(onOpenDashboard).toHaveBeenCalledWith(PROJECT_ID, "my-work", "thread-1");
  });

  it("leaves a recipe or Quick Start kickoff to its own launcher", () => {
    kickoff({ kickoffPending: true });

    expect(sendKickoffAtClick).not.toHaveBeenCalled();
  });
});
