import { ProjectId, type CloudSession } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { getDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  cloudSessionTargetAppliesToProject,
  cloudSessionTargetBelongsToOtherProject,
  draftRetainsPendingCloudSession,
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
    writeDraftCloudQueuedSend("draft-1", null);
  });

  it("only a target stamped for another project is out of place", () => {
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: "a" }, "b")).toBe(true);
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: "a" }, "a")).toBe(false);
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: null }, "b")).toBe(false);
    expect(cloudSessionTargetBelongsToOtherProject({ projectKey: "a" }, null)).toBe(false);
    expect(cloudSessionTargetAppliesToProject({ projectKey: "a" }, "a")).toBe(true);
    expect(cloudSessionTargetAppliesToProject({ projectKey: "a" }, "b")).toBe(false);
    expect(cloudSessionTargetAppliesToProject(null, "a")).toBe(false);
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

  it("keeps an unsent target when the project changes before the first message", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "machine-a",
      projectKey: "project-a",
    });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "kept" });
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-a",
    });
    expect(cloudSessionTargetAppliesToProject(getCloudSessionTarget("draft-1"), "project-b")).toBe(
      false,
    );
  });

  it("keeps a queued first message when the project changes", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "pti-polassist · 04:37 PM",
      projectKey: "project-a",
    });
    const draftId = DraftId.make("draft-1");
    useComposerDraftStore.getState().setPrompt(draftId, "hello");
    writeDraftCloudQueuedSend("draft-1", queued);
    useComposerDraftStore.getState().setPrompt(draftId, "");
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "kept" });
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      projectKey: "project-a",
    });
    expect(getDraftCloudQueuedSend("draft-1")).toMatchObject({
      messageId: "msg-1",
      sessionId: "session-9",
      projectKey: "project-a",
    });
    expect(draftRetainsPendingCloudSession("draft-1")).toBe(true);
    // Still delivers to the original session once that machine is ready.
    expect(
      decideCloudQueuedSendFlush({
        queued: getDraftCloudQueuedSend("draft-1")!,
        target: getCloudSessionTarget("draft-1"),
        session: readySession(),
        connectFailure: null,
        machineConnected: true,
        projectId: ProjectId.make("p-a"),
        scratch: false,
        threadExists: false,
      }),
    ).toEqual({ kind: "dispatch", environmentId: "env-cloud", projectId: "p-a" });
  });

  it("leaves a target with no project stamp alone", () => {
    selectCloudSessionTarget({ scopeKey: "draft-1", sessionId: "session-9", label: "machine" });
    expect(followCloudSessionProject("draft-1", "project-b")).toEqual({ kind: "kept" });
  });

  it("retains a draft that only has a creating cloud target", () => {
    expect(draftRetainsPendingCloudSession("draft-1")).toBe(false);
    selectCloudSessionCreating("draft-1", "New cloud session", "project-a");
    expect(draftRetainsPendingCloudSession("draft-1")).toBe(true);
  });
});
