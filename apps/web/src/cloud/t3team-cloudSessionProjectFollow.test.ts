import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { getDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  cloudSessionTargetBelongsToOtherProject,
  followCloudSessionProject,
} from "./t3team-cloudSessionProjectFollow";
import { queueCloudSessionSendIfNeeded } from "./t3team-cloudSessionQueueSend";
import {
  clearCloudSessionTarget,
  getCloudSessionTarget,
  resolveCloudSessionCreating,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";

const turn = (() => {
  const decoded = decodeCloudQueuedSend({
    messageId: "msg-1",
    messageText: "hello",
    outgoingText: "hello",
    titleSeed: "hello",
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    sessionId: "-",
    sessionLabel: "-",
    createdAt: "2026-10-12T00:00:00.000Z",
  })!;
  const { sessionId: _s, sessionLabel: _l, projectKey: _p, createdAt: _c, ...rest } = decoded;
  return rest;
})();

describe("cloud session follows the composer project (1215)", () => {
  beforeEach(() => {
    clearCloudSessionTarget("draft-1");
    writeDraftCloudQueuedSend("draft-1", null);
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
      label: "machine-a",
      projectKey: "project-a",
    });
  });

  it("keeps a queued first message when the project changes mid-setup", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "pti-polassist · 04:37 PM",
      projectKey: "project-a",
    });
    const draftId = DraftId.make("draft-1");
    useComposerDraftStore.getState().setPrompt(draftId, "hello");
    writeDraftCloudQueuedSend(
      "draft-1",
      decodeCloudQueuedSend({
        ...turn,
        sessionId: "session-9",
        sessionLabel: "pti-polassist · 04:37 PM",
        projectKey: "project-a",
        createdAt: "2026-10-12T00:00:00.000Z",
      })!,
    );
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({
      kind: "kept",
      otherProject: true,
    });
    expect(getCloudSessionTarget("draft-1")).not.toBeNull();
    expect(getDraftCloudQueuedSend("draft-1")).toMatchObject({
      messageId: "msg-1",
      sessionId: "session-9",
    });
  });

  it("queues the composer project at send time, not an earlier create stamp", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-a",
    });
    useComposerDraftStore.getState().setPrompt(DraftId.make("draft-1"), "hello");
    // Switch happened before send: checkout must use the confirmed composer project.
    const queued = queueCloudSessionSendIfNeeded({
      draftId: "draft-1",
      turn,
      sessions: [],
      projectKey: "project-b",
    });
    expect(queued).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-b",
    });
    expect(getDraftCloudQueuedSend("draft-1")?.projectKey).toBe("project-b");
  });

  it("leaves a target with no project stamp alone", () => {
    selectCloudSessionTarget({ scopeKey: "draft-1", sessionId: "session-9", label: "machine" });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({
      kind: "kept",
      otherProject: false,
    });
  });
});
