import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { getDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  cloudSessionTargetBelongsToOtherProject,
  followCloudSessionProject,
} from "./t3team-cloudSessionProjectFollow";
import {
  clearCloudSessionTarget,
  getCloudSessionTarget,
  resolveCloudSessionCreating,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";

const queued = decodeCloudQueuedSend({
  messageId: "msg-1",
  messageText: "hello",
  outgoingText: "hello",
  titleSeed: "hello",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "machine-a",
  createdAt: "2026-10-12T00:00:00.000Z",
})!;

describe("cloud session follows the composer project (1215)", () => {
  beforeEach(() => {
    clearCloudSessionTarget("draft-1");
  });

  it("only a target stamped for another project is out of place", () => {
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: "a" }, "b")).toBe(true);
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: "a" }, "a")).toBe(false);
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: null }, "b")).toBe(false);
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: "a" }, null)).toBe(false);
  });

  it("keeps the project stamp from create through resolve", () => {
    selectCloudSessionCreating("draft-1", "New cloud session", "project-a");
    resolveCloudSessionCreating("draft-1", "session-9", "machine-a · 7:00 PM");
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-a",
    });
  });

  it("keeps the target while the project is the one it was created for", () => {
    selectCloudSessionCreating("draft-1", "New cloud session", "project-a");
    expect(followCloudSessionProject("draft-1", "project-a")).toEqual({
      kind: "kept",
      otherProject: false,
    });
    expect(getCloudSessionTarget("draft-1")).not.toBeNull();
  });

  it("keeps an unsent target when the project changes before the first message", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-a",
    });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({
      kind: "kept",
      otherProject: true,
    });
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-a",
      label: "machine-a",
    });
  });

  it("keeps a queued first message when the project changes mid-setup", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-a",
    });
    const draftId = DraftId.make("draft-1");
    useComposerDraftStore.getState().setPrompt(draftId, "hello");
    writeDraftCloudQueuedSend("draft-1", queued);
    useComposerDraftStore.getState().setPrompt(draftId, "");
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({
      kind: "kept",
      otherProject: true,
    });
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-a",
    });
    expect(getDraftCloudQueuedSend("draft-1")).toMatchObject({
      messageId: "msg-1",
      sessionId: "session-9",
      messageText: "hello",
    });
    expect(useComposerDraftStore.getState().draftsByThreadKey["draft-1"]?.prompt).toBe("");
  });

  it("leaves a target with no project stamp alone", () => {
    selectCloudSessionTarget({ scopeKey: "draft-1", sessionId: "session-9", label: "machine" });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({
      kind: "kept",
      otherProject: false,
    });
  });
});
