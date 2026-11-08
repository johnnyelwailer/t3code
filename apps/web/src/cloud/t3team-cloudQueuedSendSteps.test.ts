import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  presentCloudQueuedSendProgress,
  resolveCloudQueuedSendStepId,
  type CloudQueuedSendStepFacts,
} from "./t3team-cloudQueuedSendSteps";

const T0 = Date.parse("2026-10-13T08:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

const queued = decodeCloudQueuedSend({
  messageId: "msg-1",
  messageText: "hello",
  outgoingText: "hello",
  titleSeed: "hello",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "nexi-machine",
  createdAt: at(0),
  stepStartedAt: { queued: at(0), machine: at(12) },
})!;

function session(phase: CloudSession["phase"], extra: Partial<CloudSession> = {}): CloudSession {
  return {
    sessionId: "session-9",
    providerKind: "github_actions",
    phase,
    elapsedSeconds: 40,
    remainingSeconds: null,
    machineLabel: "nexi-machine",
    failureReason: null,
    detailsUrl: null,
    environmentId: "env-cloud",
    ...extra,
  } as CloudSession;
}

const facts = (over: Partial<CloudQueuedSendStepFacts>): CloudQueuedSendStepFacts => ({
  queued,
  session: null,
  machineConnected: false,
  projectReady: false,
  flushing: false,
  ...over,
});

describe("cloud queued send steps", () => {
  it("walks Queued → Machine → Server start → Connect → Project ready → Sent", () => {
    const step = (over: Partial<CloudQueuedSendStepFacts>) =>
      resolveCloudQueuedSendStepId(facts(over));
    expect(step({})).toBe("queued");
    expect(step({ session: session("queued") })).toBe("queued");
    expect(step({ session: session("preparing") })).toBe("machine");
    expect(step({ session: session("starting") })).toBe("server");
    // Ready but the machine has not reported in: connecting, not a project gap (408).
    expect(step({ session: session("ready") })).toBe("connect");
    expect(step({ session: session("ready"), machineConnected: true })).toBe("project");
    expect(step({ session: session("ready"), machineConnected: true, flushing: true })).toBe(
      "sent",
    );
  });

  it("shows the live machine stage, per-step elapsed and the session's own estimate", () => {
    const view = presentCloudQueuedSendProgress(
      facts({
        session: session("preparing", { projectMachine: true, machineStage: "installing" }),
      }),
      T0 + 50_000,
    );
    expect(view.currentStepId).toBe("machine");
    expect(view.title).toBe("Installing Nexi…");
    expect(view.steps.map((step) => [step.id, step.status, step.elapsedSeconds])).toEqual([
      ["queued", "done", 12],
      ["machine", "running", 38],
      ["server", "pending", null],
      ["connect", "pending", null],
      ["project", "pending", null],
      ["sent", "pending", null],
    ]);
    expect(view.steps[1]?.detail).toBe("Installing Nexi");
    expect(view.progress).toBeGreaterThan(0);
    expect(view.progress).toBeLessThan(1);
  });

  it("names what the project step waits on in its detail and title, and escalates with time", () => {
    const projectWait = classifyCloudProjectWait({
      environmentId: EnvironmentId.make("env-cloud"),
      scratch: false,
      machineSettingsLoaded: true,
      expectedCwd: "/workspace/app",
      scratchRoot: null,
      composer: null,
      projects: [],
    });
    const stamped = {
      ...queued,
      stepStartedAt: { queued: at(0), machine: at(12), connect: at(100), project: at(110) },
    };
    const onProject = (nowSeconds: number) =>
      presentCloudQueuedSendProgress(
        facts({
          queued: stamped,
          session: session("ready"),
          machineConnected: true,
          projectWait,
        }),
        T0 + nowSeconds * 1000,
      );
    const early = onProject(115);
    expect(early.currentStepId).toBe("project");
    expect(early.title).toBe("Waiting for the cloud machine to send its project list…");
    expect(early.steps.find((step) => step.id === "project")?.detail).toBe(
      "Waiting for the cloud machine to send its project list",
    );
    expect(early.projectWait?.level).toBe("waiting");
    expect(onProject(140).projectWait?.level).toBe("expected");
    expect(onProject(110 + 600).projectWait).toMatchObject({
      level: "slow",
      diagnostic: expect.stringContaining("projects=0"),
    });
    const quiet = presentCloudQueuedSendProgress(
      facts({ queued: stamped, session: session("ready"), machineConnected: true }),
      T0 + 115_000,
    );
    expect(quiet.title).toBe("Syncing project on cloud session…");
    expect(quiet.projectWait).toBeNull();
  });

  it("parks a failure on the step it failed at", () => {
    const view = presentCloudQueuedSendProgress(
      facts({
        queued: { ...queued, failureMessage: "relay denied", retryable: true },
        session: session("ready"),
      }),
      T0 + 60_000,
    );
    expect(view.failed).toBe(true);
    expect(view.title).toBe("Cloud session failed");
    expect(view.steps.find((step) => step.id === "machine")?.status).toBe("failed");
  });
});
