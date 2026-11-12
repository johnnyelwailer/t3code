import { CommandId, EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { QueuedThreadMessage } from "../state/thread-outbox-model";
import { withPendingDraftFirstTurn } from "./t3team-pendingDraftFirstTurn";

const task: QueuedThreadMessage = {
  environmentId: EnvironmentId.make("machine"),
  threadId: ThreadId.make("thread"),
  commandId: CommandId.make("command"),
  messageId: MessageId.make("message"),
  text: "Fix the build",
  attachments: [],
  creation: {
    projectId: ProjectId.make("scratch"),
    workspaceMode: "local",
    branch: null,
    worktreePath: null,
  },
  createdAt: "2026-11-09T00:00:00.000Z",
};
const pending = {
  project: { environmentId: "machine", id: "scratch", title: "Workspace" },
  firstTurnContext: { label: "Cloud session notice", text: "“ies ng” is not on this machine." },
};

describe("withPendingDraftFirstTurn", () => {
  it("attaches the pending draft's context to the task sent to its project", () => {
    const sent = withPendingDraftFirstTurn(task, pending);
    expect(sent.text).toMatch(/^Fix the build\n\n\[Cloud session notice\]\(t3-context:/);
    expect(sent.context?.records).toEqual([
      expect.objectContaining({ kind: "setup-note", payload: pending.firstTurnContext.text }),
    ]);
  });

  it("sends the task unchanged to another project, without context, or with no pending draft", () => {
    const elsewhere = { ...task, environmentId: EnvironmentId.make("laptop") };
    expect(withPendingDraftFirstTurn(elsewhere, pending)).toBe(elsewhere);
    expect(withPendingDraftFirstTurn(task, { project: pending.project })).toBe(task);
    expect(withPendingDraftFirstTurn(task, null)).toBe(task);
  });
});
