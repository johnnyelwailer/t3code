import { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { sendT3TeamThreadTurn } from "~/t3team/chat/t3team-sendThreadTurn";
import { environmentIdOfThread } from "~/t3team/chat/t3team-threadEnvironmentLookup";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  buildDraftFeedbackText,
  deliverDraftFeedbackToSourceThread,
} from "./t3team-deliverDraftFeedbackToSourceThread";

vi.mock("~/t3team/chat/t3team-sendThreadTurn", () => ({
  sendT3TeamThreadTurn: vi.fn(async () => undefined),
}));
vi.mock("~/t3team/chat/t3team-threadEnvironmentLookup", () => ({
  environmentIdOfThread: vi.fn(() => null),
}));

const sendTurn = vi.mocked(sendT3TeamThreadTurn);
const threadEnvironmentOf = vi.mocked(environmentIdOfThread);
const THREAD_ENV = EnvironmentId.make("thread-env");

const draft: T3TeamDraftMutation = {
  id: "jira-draft:m1",
  createdAt: "2026-07-26T10:00:00.000Z",
  sourceThreadId: "thread-1",
  target: { provider: "jira", issueIdOrKey: "PROJ-42" },
  field: "assignee",
  status: "returned",
  patch: { assigneeAccountId: "abc-123" },
};

describe("deliverDraftFeedbackToSourceThread", () => {
  beforeEach(() => {
    useT3TeamDraftMutationStore.setState({ drafts: [draft] });
    sendTurn.mockReset();
    sendTurn.mockResolvedValue(undefined);
    threadEnvironmentOf.mockReset();
    threadEnvironmentOf.mockReturnValue(THREAD_ENV);
  });

  it("sends the feedback as a turn on the proposing thread, on that thread's environment", async () => {
    await deliverDraftFeedbackToSourceThread({
      sourceThreadId: draft.sourceThreadId,
      draftId: draft.id,
      issueIdOrKey: "PROJ-42",
      field: "assignee",
      feedback: "Wrong person — it should go to Sam.",
    });

    expect(threadEnvironmentOf).toHaveBeenCalledWith("thread-1");
    expect(sendTurn).toHaveBeenCalledTimes(1);
    const sent = sendTurn.mock.calls[0]![0];
    expect(sent.environmentId).toBe(THREAD_ENV);
    expect(sent.threadId).toBe("thread-1");
    expect(sent.text).toContain("Wrong person — it should go to Sam.");
    expect(sent.text).toContain("PROJ-42");
    expect(useT3TeamDraftMutationStore.getState().drafts[0]).not.toHaveProperty("error");
  });

  it("records why the agent was not told when delivery fails", async () => {
    sendTurn.mockRejectedValueOnce(new Error("already has a turn in progress"));

    await deliverDraftFeedbackToSourceThread({
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

  it("records it as undelivered when no connected environment has the thread", async () => {
    threadEnvironmentOf.mockReturnValue(null);

    await deliverDraftFeedbackToSourceThread({
      sourceThreadId: draft.sourceThreadId,
      draftId: draft.id,
      issueIdOrKey: "PROJ-42",
      field: "assignee",
      feedback: "Wrong person.",
    });

    expect(sendTurn).not.toHaveBeenCalled();
    expect(useT3TeamDraftMutationStore.getState().drafts[0]!.error).toContain("not connected");
  });

  it("does nothing when the draft has no proposing thread", async () => {
    await deliverDraftFeedbackToSourceThread({
      sourceThreadId: undefined,
      draftId: draft.id,
      issueIdOrKey: "PROJ-42",
      field: "assignee",
      feedback: "Wrong person.",
    });

    expect(sendTurn).not.toHaveBeenCalled();
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
