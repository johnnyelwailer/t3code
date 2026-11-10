import { ProjectId, type CloudSession } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
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
  sessionLabel: "pti-polassist · 04:37 PM",
  projectKey: "project-a",
  createdAt: "2026-10-12T00:00:00.000Z",
})!;

function readySession(): CloudSession {
  return {
    sessionId: "session-9",
    phase: "ready",
    environmentId: "env-cloud",
  } as CloudSession;
}

describe("cloud session follows the composer project", () => {
  beforeEach(() => {
    clearCloudSessionTarget("draft-1");
    clearCloudSessionTarget("draft-2");
    writeDraftCloudQueuedSend("draft-1", null);
    writeDraftCloudQueuedSend("draft-2", null);
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
    expect(followCloudSessionProject("draft-1", "project-a")).toEqual({ kind: "kept" });
    expect(getCloudSessionTarget("draft-1")).not.toBeNull();
  });

  it("rebinds the same session to the new project without clearing it", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-a",
    });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "retargeted" });
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-b",
    });
  });

  it("rebinds a queued first message with the session to the new project", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "pti-polassist · 04:37 PM",
      projectKey: "project-a",
    });
    // Seed composer state so the queued send has somewhere to live.
    useComposerDraftStore.getState().setPrompt(DraftId.make("draft-1"), "hello");
    writeDraftCloudQueuedSend("draft-1", queued);
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "retargeted" });
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-b",
    });
    expect(getDraftCloudQueuedSend("draft-1")).toMatchObject({
      messageId: "msg-1",
      sessionId: "session-9",
      projectKey: "project-b",
    });
    // Same session still delivers once the new project's machine copy is ready.
    expect(
      decideCloudQueuedSendFlush({
        queued: getDraftCloudQueuedSend("draft-1")!,
        target: getCloudSessionTarget("draft-1"),
        session: readySession(),
        connectFailure: null,
        machineConnected: true,
        projectId: ProjectId.make("p-b"),
        scratch: false,
        threadExists: false,
      }),
    ).toEqual({ kind: "dispatch", environmentId: "env-cloud", projectId: "p-b" });
  });

  it("leaves another draft's session and queued send alone", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-a",
    });
    useComposerDraftStore.getState().setPrompt(DraftId.make("draft-1"), "hello");
    writeDraftCloudQueuedSend("draft-1", queued);
    selectCloudSessionTarget({
      scopeKey: "draft-2",
      sessionId: "session-2",
      label: "machine-b",
      projectKey: "project-x",
    });
    useComposerDraftStore.getState().setPrompt(DraftId.make("draft-2"), "other");
    writeDraftCloudQueuedSend("draft-2", {
      ...queued,
      messageId: "msg-2",
      sessionId: "session-2",
      projectKey: "project-x",
    });

    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "retargeted" });

    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-b",
    });
    expect(getDraftCloudQueuedSend("draft-1")?.projectKey).toBe("project-b");
    expect(getCloudSessionTarget("draft-2")).toMatchObject({
      sessionId: "session-2",
      projectKey: "project-x",
    });
    expect(getDraftCloudQueuedSend("draft-2")).toMatchObject({
      messageId: "msg-2",
      sessionId: "session-2",
      projectKey: "project-x",
    });
  });

  it("leaves a target with no project stamp alone", () => {
    selectCloudSessionTarget({ scopeKey: "draft-1", sessionId: "session-9", label: "machine" });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "kept" });
  });
});
