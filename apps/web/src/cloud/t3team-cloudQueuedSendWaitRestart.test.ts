import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { setCloudQueuedSendDispatching } from "./t3team-cloudQueuedSendDispatching";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { getDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import { restartDraftCloudQueuedSendWait } from "./t3team-cloudQueuedSendWaitRestart";

const projectRef = scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make("project-a"));
const draftId = DraftId.make("draft-restart");

const queued = decodeCloudQueuedSend({
  messageId: "msg-restart",
  messageText: "deploy the preview",
  outgoingText: "deploy the preview",
  titleSeed: "deploy the preview",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "nexi-machine",
  createdAt: "2026-10-13T08:00:00.000Z",
  stepStartedAt: { connect: "2026-10-13T08:00:10.000Z", project: "2026-10-13T08:00:20.000Z" },
})!;

function resetStore() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
}

function queueOnDraft(record = queued) {
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(projectRef, draftId, { threadId: ThreadId.make("thread-r") });
  store.setPrompt(draftId, "deploy the preview");
  writeDraftCloudQueuedSend(draftId, record);
  store.setPrompt(draftId, "");
}

describe("restarting the project wait of a send that is still waiting", () => {
  beforeEach(resetStore);
  afterEach(() => {
    setCloudQueuedSendDispatching(queued.messageId, false);
    resetStore();
  });

  it("drops only the project stamp, and a second click has nothing left to drop", () => {
    queueOnDraft();
    expect(restartDraftCloudQueuedSendWait(draftId)).toBe(true);
    expect(getDraftCloudQueuedSend(draftId)).toEqual({
      ...queued,
      stepStartedAt: { connect: "2026-10-13T08:00:10.000Z" },
    });
    expect(restartDraftCloudQueuedSendWait(draftId)).toBe(false);
    expect(getDraftCloudQueuedSend(draftId)?.stepStartedAt).toEqual({
      connect: "2026-10-13T08:00:10.000Z",
    });
  });

  it("leaves a parked send and one that is being dispatched alone", () => {
    queueOnDraft({ ...queued, failureMessage: "kept", retryable: true });
    expect(restartDraftCloudQueuedSendWait(draftId)).toBe(false);
    expect(getDraftCloudQueuedSend(draftId)?.stepStartedAt?.project).toBe(
      "2026-10-13T08:00:20.000Z",
    );

    queueOnDraft();
    setCloudQueuedSendDispatching(queued.messageId, true);
    expect(restartDraftCloudQueuedSendWait(draftId)).toBe(false);
    expect(getDraftCloudQueuedSend(draftId)?.stepStartedAt?.project).toBe(
      "2026-10-13T08:00:20.000Z",
    );
  });

  it("says no when there is no record at all", () => {
    expect(restartDraftCloudQueuedSendWait(draftId)).toBe(false);
  });
});
