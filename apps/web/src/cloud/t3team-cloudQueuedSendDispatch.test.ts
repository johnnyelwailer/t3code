import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  cloudQueuedSendCommandId,
  dispatchCloudQueuedSend,
  type StartCloudQueuedTurn,
} from "./t3team-cloudQueuedSendDispatch";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  cancelDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";

const localEnv = EnvironmentId.make("env-local");
const cloudEnv = EnvironmentId.make("env-cloud");
const cloudProjectId = ProjectId.make("project-on-cloud");
const draftId = DraftId.make("draft-flush");
const threadId = ThreadId.make("thread-flush");

const queued = decodeCloudQueuedSend({
  messageId: "msg-flush",
  messageText: "run the migration",
  outgoingText: "run the migration",
  titleSeed: "run the migration",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "nexi-machine",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

function queueOnDraft() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(scopeProjectRef(localEnv, ProjectId.make("project-a")), draftId, {
    threadId,
  });
  store.setPrompt(draftId, "run the migration");
  writeDraftCloudQueuedSend(draftId, queued);
  store.setPrompt(draftId, "");
}

function dispatch(startTurn: StartCloudQueuedTurn) {
  return dispatchCloudQueuedSend({
    draftId,
    messageId: queued.messageId,
    environmentId: cloudEnv,
    projectId: cloudProjectId,
    projectCwd: "/workspace/project-a",
    startTurn,
  });
}

describe("dispatchCloudQueuedSend", () => {
  beforeEach(queueOnDraft);

  it("sends exactly once when two flushes race, then promotes the draft", async () => {
    let release: () => void = () => {};
    const startTurn = vi.fn<StartCloudQueuedTurn>(
      () =>
        new Promise((resolve) => {
          release = () => resolve(AsyncResult.success(undefined));
        }),
    );
    const first = dispatch(startTurn);
    const second = dispatch(startTurn);
    expect(await second).toBe("skipped");
    release();
    expect(await first).toBe("sent");
    expect(await dispatch(startTurn)).toBe("skipped");

    expect(startTurn).toHaveBeenCalledTimes(1);
    const call = startTurn.mock.calls[0]![0];
    expect(call.environmentId).toBe(cloudEnv);
    expect(call.input).toMatchObject({
      commandId: cloudQueuedSendCommandId(queued.messageId),
      threadId,
      message: { messageId: queued.messageId, text: "run the migration", attachments: [] },
      bootstrap: { createThread: { projectId: cloudProjectId, title: "run the migration" } },
    });
    expect(getDraftCloudQueuedSend(draftId)).toBeNull();
    expect(useComposerDraftStore.getState().getDraftSession(draftId)).toMatchObject({
      environmentId: cloudEnv,
      projectId: cloudProjectId,
      promotedTo: { environmentId: cloudEnv, threadId },
    });
  });

  it("refuses Cancel while the send is in flight, so the text is never restored and sent too", async () => {
    let release: () => void = () => {};
    const startTurn = vi.fn<StartCloudQueuedTurn>(
      () =>
        new Promise((resolve) => {
          release = () => resolve(AsyncResult.success(undefined));
        }),
    );
    const sending = dispatch(startTurn);
    expect(cancelDraftCloudQueuedSend(draftId)).toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt).toBe("");
    expect(getDraftCloudQueuedSend(draftId)?.messageId).toBe(queued.messageId);
    release();
    expect(await sending).toBe("sent");
    expect(getDraftCloudQueuedSend(draftId)).toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt ?? "").toBe("");
  });

  it("lets Cancel win before a send starts: nothing is dispatched", async () => {
    const startTurn = vi.fn<StartCloudQueuedTurn>(async () => AsyncResult.success(undefined));
    expect(cancelDraftCloudQueuedSend(draftId)?.messageId).toBe(queued.messageId);
    expect(await dispatch(startTurn)).toBe("skipped");
    expect(startTurn).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt).toBe(
      "run the migration",
    );
  });

  it("parks a failed send as retryable and does not resend it on its own", async () => {
    const startTurn = vi.fn<StartCloudQueuedTurn>(async () =>
      AsyncResult.failure(Cause.fail(new Error("socket closed"))),
    );
    expect(await dispatch(startTurn)).toBe("failed");
    expect(getDraftCloudQueuedSend(draftId)).toMatchObject({
      messageText: "run the migration",
      retryable: true,
    });
    expect(await dispatch(startTurn)).toBe("skipped");
    expect(startTurn).toHaveBeenCalledTimes(1);
  });
});
