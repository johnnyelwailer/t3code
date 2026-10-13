import { ProjectId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_QUEUED_SEND_NOT_CREATED_MESSAGE,
  decideCloudQueuedSendFlush,
} from "./t3team-cloudQueuedSendFlush";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

const queued = decodeCloudQueuedSend({
  messageId: "msg-1",
  messageText: "hello",
  outgoingText: "hello",
  titleSeed: "hello",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "machine",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

function session(phase: CloudSession["phase"], extra: Partial<CloudSession> = {}): CloudSession {
  return { sessionId: "session-9", phase, environmentId: "env-cloud", ...extra } as CloudSession;
}

const base = {
  queued,
  target: null,
  session: null,
  connectFailure: null,
  machineConnected: false,
  projectId: null,
  threadExists: false,
};

describe("decideCloudQueuedSendFlush", () => {
  it("waits while the session provisions, connects once ready, then dispatches once synced", () => {
    expect(decideCloudQueuedSendFlush({ ...base, session: session("preparing") }).kind).toBe(
      "wait",
    );
    expect(decideCloudQueuedSendFlush({ ...base, session: session("ready") }).kind).toBe("connect");
    expect(
      decideCloudQueuedSendFlush({ ...base, session: session("ready"), machineConnected: true })
        .kind,
    ).toBe("wait");
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("ready"),
        machineConnected: true,
        projectId: ProjectId.make("p"),
      }),
    ).toEqual({ kind: "dispatch", environmentId: "env-cloud", projectId: "p" });
  });

  it("treats an existing thread as already delivered instead of sending again", () => {
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("ready"),
        machineConnected: true,
        projectId: ProjectId.make("p"),
        threadExists: true,
      }),
    ).toEqual({ kind: "delivered", environmentId: "env-cloud" });
  });

  it("fails an ended session without retry and a connect failure with retry", () => {
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("failed", { failureReason: "quota" }),
      }),
    ).toEqual({ kind: "fail", message: "quota", retryable: false });
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        session: session("ready"),
        connectFailure: { sessionId: "session-9", message: "relay denied" },
      }),
    ).toEqual({ kind: "fail", message: "relay denied", retryable: true });
  });

  it("follows the create sentinel to the real session, or fails when the create is gone", () => {
    const creating = { ...queued, sessionId: CLOUD_SESSION_CREATING_ID };
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        queued: creating,
        target: { sessionId: "session-9", label: "machine" },
      }),
    ).toEqual({ kind: "resolve-session", sessionId: "session-9", label: "machine" });
    expect(decideCloudQueuedSendFlush({ ...base, queued: creating })).toEqual({
      kind: "fail",
      message: CLOUD_QUEUED_SEND_NOT_CREATED_MESSAGE,
      retryable: false,
    });
  });

  it("stays parked once failed", () => {
    expect(
      decideCloudQueuedSendFlush({
        ...base,
        queued: { ...queued, failureMessage: "x" },
        session: session("ready"),
        machineConnected: true,
        projectId: ProjectId.make("p"),
      }).kind,
    ).toBe("wait");
  });
});
