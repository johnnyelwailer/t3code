import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, type CloudSession } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { getDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import { queueCloudSessionSendIfNeeded } from "./t3team-cloudSessionQueueSend";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import {
  clearCloudSessionTarget,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";

const draftId = DraftId.make("draft-1");
const {
  sessionId: _s,
  sessionLabel: _l,
  createdAt: _c,
  ...turn
} = decodeCloudQueuedSend({
  messageId: "msg-1",
  messageText: "hello cloud",
  outgoingText: "hello cloud",
  titleSeed: "hello cloud",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "-",
  sessionLabel: "-",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

describe("queueCloudSessionSendIfNeeded", () => {
  beforeEach(() => {
    clearCloudSessionTarget(draftId);
    useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(
      scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make("project-a")),
      draftId,
      { threadId: ThreadId.make("thread-1") },
    );
    store.setPrompt(draftId, "hello cloud");
  });

  it("persists the send on the draft while the create is still in flight", () => {
    selectCloudSessionCreating(draftId);
    const queued = queueCloudSessionSendIfNeeded({ draftId, turn, sessions: [] });
    expect(queued).toMatchObject({
      messageText: "hello cloud",
      sessionId: CLOUD_SESSION_CREATING_ID,
    });
    expect(getDraftCloudQueuedSend(draftId)).toEqual(queued);
  });

  it("queues for a ready session too, so one path delivers it", () => {
    selectCloudSessionTarget({ scopeKey: draftId, sessionId: "s-1", label: "Cloud session" });
    const session = { sessionId: "s-1", phase: "ready" } as CloudSession;
    expect(
      queueCloudSessionSendIfNeeded({ draftId, turn, sessions: [session] })?.sessionLabel,
    ).toBe("Cloud session");
  });

  it("sends normally without a target, for an ended session, or outside a draft", () => {
    expect(queueCloudSessionSendIfNeeded({ draftId, turn, sessions: [] })).toBeNull();
    selectCloudSessionTarget({ scopeKey: draftId, sessionId: "s-1", label: "x" });
    const ended = { sessionId: "s-1", phase: "failed" } as CloudSession;
    expect(queueCloudSessionSendIfNeeded({ draftId, turn, sessions: [ended] })).toBeNull();
    expect(queueCloudSessionSendIfNeeded({ draftId: null, turn, sessions: [] })).toBeNull();
    expect(getDraftCloudQueuedSend(draftId)).toBeNull();
  });
});
