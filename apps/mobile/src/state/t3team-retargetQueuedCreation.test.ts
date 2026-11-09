import { CommandId, EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { retargetQueuedCreation } from "./t3team-retargetQueuedCreations";
import type { QueuedThreadMessage } from "./thread-outbox-model";

const placeholder = {
  environmentId: EnvironmentId.make("pending-env"),
  projectId: ProjectId.make("pending-project"),
};
const real = { environmentId: EnvironmentId.make("machine"), projectId: ProjectId.make("repo") };

const queuedOnPlaceholder = (
  overrides: Partial<QueuedThreadMessage> = {},
): QueuedThreadMessage => ({
  environmentId: placeholder.environmentId,
  threadId: ThreadId.make("new-thread"),
  commandId: CommandId.make("command"),
  messageId: MessageId.make("message"),
  text: "Fix the build",
  attachments: [],
  creation: {
    projectId: placeholder.projectId,
    projectTitle: "Repo",
    workspaceMode: "local",
    branch: null,
    worktreePath: null,
  },
  createdAt: "2026-11-09T00:00:00.000Z",
  ...overrides,
});

describe("retargetQueuedCreation", () => {
  it("moves the thread target and project, dropping the placeholder's workspace path", () => {
    const moved = retargetQueuedCreation(
      queuedOnPlaceholder({
        creation: { ...queuedOnPlaceholder().creation!, projectCwd: "/placeholder" },
      }),
      placeholder,
      real,
    );
    expect(moved?.environmentId).toBe("machine");
    expect(moved?.threadId).toBe("new-thread");
    expect(moved?.creation).toEqual({
      projectId: "repo",
      projectTitle: "Repo",
      workspaceMode: "local",
      branch: null,
      worktreePath: null,
    });
  });

  it("returns null for a follow-up message or another placeholder", () => {
    const { creation: _creation, ...followUp } = queuedOnPlaceholder();
    expect(retargetQueuedCreation(followUp, placeholder, real)).toBeNull();
    expect(
      retargetQueuedCreation(
        queuedOnPlaceholder({ environmentId: EnvironmentId.make("other-env") }),
        placeholder,
        real,
      ),
    ).toBeNull();
  });
});
