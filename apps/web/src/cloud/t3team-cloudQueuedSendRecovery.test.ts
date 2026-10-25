import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  logCloudProjectWaitCancelled,
  logCloudProjectWaitOutcome,
  resetCloudProjectWaitLog,
  type CloudProjectWaitOutcomeLine,
} from "./t3team-cloudProjectWaitLog";
import { applyCloudQueuedSendAction } from "./t3team-cloudQueuedSendActions";
import {
  decodeCloudQueuedSend,
  isProjectNotResolved,
  type CloudQueuedSend,
} from "./t3team-cloudQueuedSendModel";
import {
  sendQueuedInMachineProject,
  startPlainSessionForQueuedSend,
} from "./t3team-cloudQueuedSendRecovery";
import {
  failDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import { getCloudSessionTarget } from "./t3team-cloudSessionTargetStore";

const draftId = "draft-1";
const T0 = Date.parse("2026-10-13T08:00:00.000Z");
const raw = {
  messageId: "msg-1",
  messageText: "deploy the preview",
  outgoingText: "deploy the preview",
  titleSeed: "deploy the preview",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "machine",
  createdAt: "2026-10-13T07:50:00.000Z",
};
const stamped = (extra: Record<string, unknown> = {}) =>
  decodeCloudQueuedSend({
    ...raw,
    stepStartedAt: { queued: raw.createdAt, project: new Date(T0).toISOString() },
    ...extra,
  })!;

function queue(record: CloudQueuedSend) {
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(
    scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make("project-a")),
    DraftId.make(draftId),
    { threadId: ThreadId.make("thread-1") },
  );
  store.setPrompt(DraftId.make(draftId), "x");
  writeDraftCloudQueuedSend(draftId, record);
  store.setPrompt(DraftId.make(draftId), "");
}

beforeEach(() => {
  resetCloudProjectWaitLog();
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
});

describe("the persisted record", () => {
  it("decodes records from before the typed failure, and keeps a kind a newer build wrote", () => {
    expect(decodeCloudQueuedSend(raw)).not.toBeNull();
    const future = decodeCloudQueuedSend({
      ...raw,
      failureMessage: "x",
      failureKind: "send_timeout",
    });
    expect(future?.messageText).toBe("deploy the preview");
    expect(isProjectNotResolved(future!)).toBe(false);
  });

  it("stores the typed failure with the message", () => {
    queue(stamped());
    failDraftCloudQueuedSend(draftId, "msg-1", "gave up", true, {
      kind: "project_not_resolved",
      reason: "different-repository",
    });
    expect(getDraftCloudQueuedSend(draftId)).toMatchObject({
      failureKind: "project_not_resolved",
      failureReason: "different-repository",
      messageText: "deploy the preview",
    });
  });
});

describe("ways out of project_not_resolved", () => {
  const park = () =>
    failDraftCloudQueuedSend(draftId, "msg-1", "gave up", true, {
      kind: "project_not_resolved",
      reason: "no-matching-project",
    });

  it("sends in the machine's project: a fresh wait, flagged, the message untouched", () => {
    queue(stamped());
    park();
    sendQueuedInMachineProject(draftId);
    const record = getDraftCloudQueuedSend(draftId)!;
    expect(record).toMatchObject({ sendInMachineProject: true, messageText: "deploy the preview" });
    expect(record.failureMessage).toBeUndefined();
    expect(record.failureKind).toBeUndefined();
    expect(record.stepStartedAt).toEqual({ queued: raw.createdAt });
  });

  it("offers the machine's project only after this failure, not for any parked send", () => {
    queue(stamped({ failureMessage: "relay denied", retryable: true }));
    sendQueuedInMachineProject(draftId);
    expect(getDraftCloudQueuedSend(draftId)!.sendInMachineProject).toBeUndefined();
  });

  it("starts a plain session: the send follows a create in flight, with the plain option", () => {
    queue(stamped());
    park();
    const onCreate = vi.fn();
    expect(
      startPlainSessionForQueuedSend({
        draftId,
        scopeKey: draftId,
        projectKey: "github.com/acme/app",
        projectId: ProjectId.make("project-a"),
        onCreate,
      }),
    ).toBe(true);
    expect(onCreate).toHaveBeenCalledExactlyOnceWith("project-a", { plain: true });
    const record = getDraftCloudQueuedSend(draftId)!;
    expect(record).toMatchObject({
      sessionId: CLOUD_SESSION_CREATING_ID,
      messageText: "deploy the preview",
    });
    expect(record.failureMessage).toBeUndefined();
    expect(getCloudSessionTarget(draftId)).toMatchObject({
      sessionId: CLOUD_SESSION_CREATING_ID,
      projectKey: "github.com/acme/app",
    });
  });

  it("starts nothing without a project to start in, or when the send is not parked on it", () => {
    queue(stamped());
    const onCreate = vi.fn();
    const input = { draftId, scopeKey: draftId, projectKey: null, onCreate };
    expect(startPlainSessionForQueuedSend({ ...input, projectId: ProjectId.make("p") })).toBe(
      false,
    );
    park();
    expect(startPlainSessionForQueuedSend({ ...input, projectId: undefined })).toBe(false);
    expect(onCreate).not.toHaveBeenCalled();
    expect(getDraftCloudQueuedSend(draftId)!.failureKind).toBe("project_not_resolved");
  });
});

describe("one outcome line per wait", () => {
  const sink = () => {
    const lines: CloudProjectWaitOutcomeLine[] = [];
    return { lines, write: (line: CloudProjectWaitOutcomeLine) => lines.push(line) };
  };
  const at = (seconds: number) => T0 + seconds * 1000;

  it("says how it ended, where, why and after how long, once however often it is asked", () => {
    const out = sink();
    const input = {
      queued: stamped(),
      outcome: "failed" as const,
      environmentId: "env-cloud",
      reason: "project-not-listed",
      nowMs: at(181),
    };
    expect(logCloudProjectWaitOutcome(input, out.write)).toBe(true);
    expect(logCloudProjectWaitOutcome(input, out.write)).toBe(false);
    expect(out.lines).toEqual([
      {
        outcome: "failed",
        environmentId: "env-cloud",
        reason: "project-not-listed",
        elapsedSeconds: 181,
        messageId: "msg-1",
      },
    ]);
  });

  it("writes nothing for a send that never waited on its project", () => {
    const out = sink();
    const unstamped = decodeCloudQueuedSend(raw)!;
    expect(
      logCloudProjectWaitOutcome(
        {
          queued: unstamped,
          outcome: "resolved-folder",
          environmentId: "e",
          reason: null,
          nowMs: at(1),
        },
        out.write,
      ),
    ).toBe(false);
    expect(out.lines).toEqual([]);
  });

  it("tells a retry's attempt from the first one", () => {
    const out = sink();
    const first = stamped();
    const retry = stamped({ stepStartedAt: { project: new Date(at(400)).toISOString() } });
    const base = { outcome: "failed" as const, environmentId: "e", reason: "r" };
    logCloudProjectWaitOutcome({ ...base, queued: first, nowMs: at(180) }, out.write);
    logCloudProjectWaitOutcome({ ...base, queued: retry, nowMs: at(580) }, out.write);
    expect(out.lines.map((l) => l.elapsedSeconds)).toEqual([180, 180]);
  });

  it("logs a dispatch as resolved by the welcome's id or by folder, and a typed failure with its reason", () => {
    const out = sink();
    const ctx = (resolvedBy: "bootstrap-id" | "folder" | null) =>
      ({
        draftId,
        queued: stamped(),
        threadId: ThreadId.make("thread-1"),
        projectCwd: null,
        requests: new Map(),
        draftPageOpen: true,
        connect: () => {},
        openScratchProject: async () => null,
        startTurn: vi.fn(),
        projectWaitLog: { nowMs: at(12), resolvedBy, sink: out.write },
      }) as never;
    const dispatch = {
      kind: "dispatch",
      environmentId: EnvironmentId.make("env-cloud"),
      projectId: ProjectId.make("p"),
    } as const;
    applyCloudQueuedSendAction(dispatch, ctx("bootstrap-id"));
    resetCloudProjectWaitLog();
    applyCloudQueuedSendAction(dispatch, ctx("folder"));
    expect(out.lines.map((l) => [l.outcome, l.elapsedSeconds])).toEqual([
      ["resolved-bootstrap-id", 12],
      ["resolved-folder", 12],
    ]);
  });

  it("logs a cancel only when it ended a wait on the project", () => {
    const out = sink();
    const base = { environmentId: "env-cloud", reason: "project-list-pending", nowMs: at(30) };
    expect(
      logCloudProjectWaitCancelled(
        { ...base, cancelled: stamped(), waitingOnProject: true },
        out.write,
      ),
    ).toBe(true);
    const other = stamped({
      stepStartedAt: { project: new Date(at(1)).toISOString() },
      messageId: "msg-2",
    });
    expect(
      logCloudProjectWaitCancelled(
        { ...base, cancelled: other, waitingOnProject: false },
        out.write,
      ),
    ).toBe(false);
    const parked = stamped({
      messageId: "msg-3",
      failureKind: "project_not_resolved",
      failureReason: "different-folder",
    });
    logCloudProjectWaitCancelled(
      { ...base, cancelled: parked, waitingOnProject: false },
      out.write,
    );
    expect(
      logCloudProjectWaitCancelled({ ...base, cancelled: null, waitingOnProject: true }, out.write),
    ).toBe(false);
    expect(out.lines.map((l) => [l.outcome, l.reason])).toEqual([
      ["cancelled", "project-list-pending"],
      ["cancelled", "different-folder"],
    ]);
  });
});
