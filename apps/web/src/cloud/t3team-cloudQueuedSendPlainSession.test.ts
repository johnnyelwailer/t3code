/**
 * "Start a plain session" on a send that gave up waiting for its project. The send must end up on
 * the NEW session's machine exactly once: never on the old one, never in both, never dropped.
 * The create's own answer is what re-targets it (not a shared "last created session" store), so
 * each case is driven by hand-held create callbacks: no clock, no sleeps.
 */
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, type CloudSession } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { setCloudSessionLocal } from "./t3team-cloudSessionLocalStore";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  forgetPlainSessionStarts,
  startPlainSessionForQueuedSend,
} from "./t3team-cloudQueuedSendRecovery";
import { sendQueuedInMachineProject } from "./t3team-cloudQueuedSendRecovery";
import {
  failDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
  cancelDraftCloudQueuedSend,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import { clearCloudSessionTarget, getCloudSessionTarget } from "./t3team-cloudSessionTargetStore";

const draftId = "draft-1";
const OLD = "session-9";
const session = (sessionId: string, environmentId: string, phase = "preparing") =>
  ({
    sessionId,
    phase,
    environmentId,
    machineLabel: "m",
    providerKind: "github_actions",
  }) as unknown as CloudSession;

function park() {
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(
    scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make("project-a")),
    DraftId.make(draftId),
    { threadId: ThreadId.make("thread-1") },
  );
  store.setPrompt(DraftId.make(draftId), "x");
  writeDraftCloudQueuedSend(
    draftId,
    decodeCloudQueuedSend({
      messageId: "msg-1",
      messageText: "deploy the preview",
      outgoingText: "deploy the preview",
      titleSeed: "deploy the preview",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      sessionId: OLD,
      sessionLabel: "old machine",
      projectKey: "github.com/acme/app",
      createdAt: "2026-10-13T07:50:00.000Z",
      stepStartedAt: { queued: "2026-10-13T07:50:00.000Z", project: "2026-10-13T08:00:00.000Z" },
      sendInMachineProject: true,
    })!,
  );
  store.setPrompt(DraftId.make(draftId), "");
  failDraftCloudQueuedSend(draftId, "msg-1", "gave up", true, {
    kind: "project_not_resolved",
    reason: "different-repository",
  });
}

type Options = { plain?: boolean; onCreated?: (s: CloudSession) => void; onFailed?: () => void };

/** A create the test answers by hand; `started: false` is a create that refused to start. */
function create(started = true) {
  const calls: Array<{ projectId: unknown; options: Options }> = [];
  const onCreate = vi.fn((projectId?: ProjectId, options?: Options) => {
    calls.push({ projectId, options: options ?? {} });
    return started;
  });
  return { onCreate, calls, last: () => calls.at(-1)!.options };
}

const start = (c: ReturnType<typeof create>, createPending = false) =>
  startPlainSessionForQueuedSend({
    draftId,
    scopeKey: draftId,
    projectKey: "github.com/acme/app",
    projectId: ProjectId.make("project-a"),
    createPending,
    onCreate: c.onCreate,
  });

beforeEach(() => {
  forgetPlainSessionStarts();
  clearCloudSessionTarget(draftId);
  setCloudSessionLocal(null);
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  park();
});

describe("Start a plain session", () => {
  it("(a) keeps the send parked on its session while the create is in flight, with no creating sentinel to resolve to an earlier session", () => {
    // The Run-on effect resolves a sentinel from the last created session of the window.
    setCloudSessionLocal({
      session: session("earlier", "env-earlier"),
      knownServerSessionIds: new Set(),
    });
    const c = create();
    expect(start(c)).toBe(true);
    expect(c.calls[0]?.projectId).toBe("project-a");
    expect(c.last().plain).toBe(true);
    expect(getDraftCloudQueuedSend(draftId)).toMatchObject({
      sessionId: OLD,
      failureKind: "project_not_resolved",
    });
    expect(getCloudSessionTarget(draftId)?.sessionId).not.toBe(CLOUD_SESSION_CREATING_ID);
  });

  it("(a) binds the send to the new session when that create answers, and only then", () => {
    const c = create();
    start(c);
    const fresh = session("plain-1", "env-plain");
    c.last().onCreated?.(fresh);
    const record = getDraftCloudQueuedSend(draftId)!;
    expect(record).toMatchObject({ sessionId: "plain-1", messageText: "deploy the preview" });
    expect(record.failureMessage).toBeUndefined();
    expect(record.failureKind).toBeUndefined();
    expect(record.sendInMachineProject).toBeUndefined();
    expect(record.stepStartedAt).toEqual({ queued: "2026-10-13T07:50:00.000Z" });
    expect(getCloudSessionTarget(draftId)).toMatchObject({
      sessionId: "plain-1",
      projectKey: "github.com/acme/app",
    });
    expect(JSON.stringify(record)).not.toContain(OLD);
  });

  it("(b) starts nothing while another create is in flight, and keeps the send as it is", () => {
    const c = create();
    expect(start(c, true)).toBe(false);
    expect(c.onCreate).not.toHaveBeenCalled();
    expect(getDraftCloudQueuedSend(draftId)!.failureKind).toBe("project_not_resolved");
  });

  it("(b) a create that refuses to start leaves no in-flight mark behind", () => {
    expect(start(create(false))).toBe(false);
    const c = create();
    expect(start(c)).toBe(true);
  });

  it("(c) the new session is not connected yet: the send waits on it, then goes to ITS machine", () => {
    const c = create();
    start(c);
    c.last().onCreated?.(session("plain-1", "env-plain"));
    const queued = getDraftCloudQueuedSend(draftId)!;
    const base = {
      queued,
      target: null,
      connectFailure: null,
      projectId: null,
      scratch: false,
      threadExists: false,
    };
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("plain-1", "env-plain", "preparing"),
        machineConnected: false,
      }).kind,
    ).toBe("wait");
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("plain-1", "env-plain", "ready"),
        machineConnected: false,
      }).kind,
    ).toBe("connect");
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("plain-1", "env-plain", "ready"),
        machineConnected: true,
        projectId: ProjectId.make("plain-own"),
      }),
    ).toEqual({ kind: "dispatch", environmentId: "env-plain", projectId: "plain-own" });
  });

  it("(d) a failed create leaves the parked send untouched and the action available again", () => {
    const c = create();
    start(c);
    c.last().onFailed?.();
    expect(getDraftCloudQueuedSend(draftId)).toMatchObject({
      sessionId: OLD,
      failureKind: "project_not_resolved",
    });
    const again = create();
    expect(start(again)).toBe(true);
  });

  it("(e) a second tap while the first create is in flight starts no second create", () => {
    const c = create();
    expect(start(c)).toBe(true);
    expect(start(c)).toBe(false);
    expect(c.onCreate).toHaveBeenCalledTimes(1);
  });

  it("(e) a create answered twice (a toast retry) binds once; the second session is left alone", () => {
    const c = create();
    start(c);
    const { onCreated } = c.last();
    onCreated?.(session("plain-1", "env-plain"));
    onCreated?.(session("plain-2", "env-other"));
    expect(getDraftCloudQueuedSend(draftId)!.sessionId).toBe("plain-1");
  });

  it("(f) a restart between the create and its answer loses nothing: the send is still parked and can start again", () => {
    const c = create();
    start(c);
    forgetPlainSessionStarts();
    const persisted = decodeCloudQueuedSend(
      JSON.parse(JSON.stringify(getDraftCloudQueuedSend(draftId))),
    )!;
    expect(persisted).toMatchObject({ sessionId: OLD, failureKind: "project_not_resolved" });
    const again = create();
    expect(start(again)).toBe(true);
    again.last().onCreated?.(session("plain-1", "env-plain"));
    const bound = decodeCloudQueuedSend(
      JSON.parse(JSON.stringify(getDraftCloudQueuedSend(draftId))),
    )!;
    expect(bound.sessionId).toBe("plain-1");
  });

  it("does not move a send the user has since retried, so it cannot go to both sessions", () => {
    const c = create();
    start(c);
    retryDraftCloudQueuedSend(draftId);
    c.last().onCreated?.(session("plain-1", "env-plain"));
    expect(getDraftCloudQueuedSend(draftId)!.sessionId).toBe(OLD);
  });

  it("does not bring back a send the user cancelled while the create ran", () => {
    const c = create();
    start(c);
    cancelDraftCloudQueuedSend(draftId);
    c.last().onCreated?.(session("plain-1", "env-plain"));
    expect(getDraftCloudQueuedSend(draftId)).toBeNull();
  });

  it("starts nothing without a project to start in, or when the send is not parked on it", () => {
    const c = create();
    expect(
      startPlainSessionForQueuedSend({
        draftId,
        scopeKey: draftId,
        projectKey: null,
        projectId: undefined,
        createPending: false,
        onCreate: c.onCreate,
      }),
    ).toBe(false);
    retryDraftCloudQueuedSend(draftId);
    expect(start(c)).toBe(false);
    expect(c.onCreate).not.toHaveBeenCalled();
  });
});

describe("the other two ways out stay on the send's own session", () => {
  const dispatchTarget = () => {
    const queued = getDraftCloudQueuedSend(draftId)!;
    return decideCloudQueuedSendFlush({
      queued,
      target: null,
      session: session(OLD, "env-old", "ready"),
      connectFailure: null,
      machineConnected: true,
      projectId: ProjectId.make("old-own"),
      scratch: false,
      threadExists: false,
    });
  };

  it("Retry keeps the session and so the machine the send was queued for", () => {
    retryDraftCloudQueuedSend(draftId);
    expect(getDraftCloudQueuedSend(draftId)!.sessionId).toBe(OLD);
    expect(dispatchTarget()).toMatchObject({ kind: "dispatch", environmentId: "env-old" });
  });

  it("Send in the machine's project keeps the session; only the project it binds changes", () => {
    sendQueuedInMachineProject(draftId);
    expect(getDraftCloudQueuedSend(draftId)).toMatchObject({
      sessionId: OLD,
      sendInMachineProject: true,
    });
    expect(dispatchTarget()).toMatchObject({ kind: "dispatch", environmentId: "env-old" });
  });
});
