import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { composerDraftHasUserContent, DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  cancelDraftCloudQueuedSend,
  failDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";

const projectRef = scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make("project-a"));
const draftId = DraftId.make("draft-queued");

const queued = decodeCloudQueuedSend({
  messageId: "msg-queued",
  messageText: "deploy the preview",
  outgoingText: "deploy the preview",
  titleSeed: "deploy the preview",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "nexi-machine · 7:00 PM",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

function resetStore() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
}

/** What ChatView does on a queued send: record first, then the prompt is cleared. */
function queueOnDraft() {
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(projectRef, draftId, { threadId: ThreadId.make("thread-q") });
  store.setPrompt(draftId, "deploy the preview");
  expect(writeDraftCloudQueuedSend(draftId, queued)).toBe(true);
  store.setPrompt(draftId, "");
}

/** The sidebar's rule for which draft sessions get a row. */
function hasSidebarRow(id: string): boolean {
  const state = useComposerDraftStore.getState();
  const session = state.draftThreadsByThreadKey[id];
  return (
    session !== undefined &&
    session.promotedTo == null &&
    composerDraftHasUserContent(state.draftsByThreadKey[id])
  );
}

describe("queued cloud send on the persisted draft", () => {
  beforeEach(resetStore);
  afterEach(async () => {
    resetStore();
    await useComposerDraftStore.persist.clearStorage();
    vi.useRealTimers();
  });

  it("survives a store reload and keeps its sidebar row", async () => {
    await useComposerDraftStore.persist.clearStorage();
    vi.useFakeTimers();
    queueOnDraft();
    // A new-thread request remaps the project to a fresh draft: an empty draft would be dropped.
    useComposerDraftStore
      .getState()
      .setProjectDraftThreadId(projectRef, DraftId.make("draft-fresh"), {
        threadId: ThreadId.make("thread-fresh"),
      });
    await vi.advanceTimersByTimeAsync(300);

    resetStore();
    await useComposerDraftStore.persist.rehydrate();

    expect(getDraftCloudQueuedSend(draftId)).toEqual(queued);
    expect(useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt).toBe("");
    expect(hasSidebarRow(draftId)).toBe(true);
  });

  it("parks a failure, clears it on retry, and cancel puts the message back", () => {
    queueOnDraft();
    failDraftCloudQueuedSend(draftId, queued.messageId, "relay denied", true);
    expect(getDraftCloudQueuedSend(draftId)).toMatchObject({
      failureMessage: "relay denied",
      retryable: true,
    });
    retryDraftCloudQueuedSend(draftId);
    expect(getDraftCloudQueuedSend(draftId)).toEqual(queued);

    expect(cancelDraftCloudQueuedSend(draftId)).toEqual(queued);
    expect(getDraftCloudQueuedSend(draftId)).toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt).toBe(
      "deploy the preview",
    );
  });
});
