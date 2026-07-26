import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ClientOrchestrationCommand } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  buildDraftFeedbackText,
  deliverDraftFeedbackToSourceThread,
} from "./t3team-deliverDraftFeedbackToSourceThread";

const draft: T3TeamDraftMutation = {
  id: "jira-draft:m1",
  createdAt: "2026-07-26T10:00:00.000Z",
  sourceThreadId: "thread-1",
  target: { provider: "jira", issueIdOrKey: "PROJ-42" },
  field: "assignee",
  status: "returned",
  patch: { assigneeAccountId: "abc-123" },
};

function fakeBackend(input?: { readonly rejectWith?: string }) {
  const commands: ClientOrchestrationCommand[] = [];
  const backend = {
    async dispatchCommand(command: ClientOrchestrationCommand) {
      if (input?.rejectWith) throw new Error(input.rejectWith);
      commands.push(command);
    },
  } as unknown as BackendApi;
  return { backend, commands };
}

describe("deliverDraftFeedbackToSourceThread", () => {
  beforeEach(() => {
    useT3TeamDraftMutationStore.setState({ drafts: [draft] });
  });

  it("sends the feedback as a turn on the proposing thread", async () => {
    const { backend, commands } = fakeBackend();

    await deliverDraftFeedbackToSourceThread({
      backend,
      sourceThreadId: draft.sourceThreadId,
      draftId: draft.id,
      issueIdOrKey: "PROJ-42",
      field: "assignee",
      feedback: "Wrong person — it should go to Sam.",
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: "thread.turn.start", threadId: "thread-1" });
    const text = (commands[0] as { message: { text: string } }).message.text;
    expect(text).toContain("Wrong person — it should go to Sam.");
    expect(text).toContain("PROJ-42");
    expect(useT3TeamDraftMutationStore.getState().drafts[0]).not.toHaveProperty("error");
  });

  it("records why the agent was not told when delivery fails", async () => {
    const { backend } = fakeBackend({ rejectWith: "already has a turn in progress" });

    await deliverDraftFeedbackToSourceThread({
      backend,
      sourceThreadId: draft.sourceThreadId,
      draftId: draft.id,
      issueIdOrKey: "PROJ-42",
      field: "assignee",
      feedback: "Wrong person.",
    });

    const stored = useT3TeamDraftMutationStore.getState().drafts[0]!;
    // The reviewer's decision stands; the undelivered state is recorded, not swallowed.
    expect(stored.status).toBe("returned");
    expect(stored.error).toContain("already has a turn in progress");
  });

  it("does nothing when the draft has no proposing thread", async () => {
    const { backend, commands } = fakeBackend();

    await deliverDraftFeedbackToSourceThread({
      backend,
      sourceThreadId: undefined,
      draftId: draft.id,
      issueIdOrKey: "PROJ-42",
      field: "assignee",
      feedback: "Wrong person.",
    });

    expect(commands).toEqual([]);
  });
});

describe("buildDraftFeedbackText", () => {
  it("tells the agent nothing was written and what to do next", () => {
    const text = buildDraftFeedbackText({
      issueIdOrKey: "PROJ-42",
      field: "description",
      feedback: "Too long.",
    });

    expect(text).toContain("proposed description change to PROJ-42");
    expect(text).toContain("Too long.");
    expect(text).toContain("Nothing has been written to Jira.");
  });
});
