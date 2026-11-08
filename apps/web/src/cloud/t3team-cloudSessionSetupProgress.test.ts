import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildCloudSessionSetup,
  CLOUD_SETUP_NOT_SEEN_NOTE,
  cloudSessionNotSeenYet,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
  cloudSetupReadyNote,
  cloudSetupRecovery,
  type CloudSetupFacts,
} from "./t3team-cloudSessionSetupProgress";

function session(phase: CloudSession["phase"], extra: Partial<CloudSession> = {}): CloudSession {
  return {
    sessionId: "session-1",
    providerKind: "github_actions",
    phase,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim",
    failureReason: null,
    detailsUrl: null,
    ...extra,
  };
}

const model = (facts: Partial<CloudSetupFacts> & { session: CloudSession | null }) =>
  buildCloudSessionSetup({ machineConnected: false, ...facts });

describe("buildCloudSessionSetup steps", () => {
  it("waits for project sync before claiming to send", () => {
    const facts = {
      session: session("ready"),
      machineConnected: true,
      projectReady: false,
      delivery: "queued",
    } satisfies CloudSetupFacts & { projectReady: boolean };
    expect(model(facts).currentStep.id).toBe("project");
  });

  it("treats a stopped session with a waiting message as terminal", () => {
    const m = model({ session: session("stopped"), delivery: "queued" });
    expect(m.stage).toBe("failed");
    expect(m.failureReason).toBe("Cloud session ended before it could connect.");
  });

  it("does not claim a missing session is reserving a machine", () => {
    expect(model({ session: null, delivery: "queued" }).activity).toBe(
      "Waiting for cloud session status…",
    );
  });

  it("walks a plain session through three steps, naming the live one", () => {
    const m = model({ session: session("preparing") });
    expect(m.steps.map((s) => [s.id, s.label, s.status])).toEqual([
      ["queued", "Queued", "done"],
      ["machine", "Building workspace", "current"],
      ["server", "Server start", "upcoming"],
    ]);
    expect(m.activity).toBe("Building workspace…");
  });

  it("uses no pipeline jargon in any label or activity", () => {
    for (const phase of ["requested", "queued", "preparing", "starting", "ready"] as const) {
      for (const extra of [{}, { projectMachine: true }, { machineSetup: true }]) {
        for (const delivery of ["none", "queued", "sending"] as const) {
          const m = model({ session: session(phase, extra), delivery });
          const words = [...m.steps.map((s) => s.label), m.activity, m.title].join(" ");
          expect(words).not.toMatch(/broker|pairing|workflow|runner|job|relay|devcontainer/i);
        }
      }
    }
  });

  it("names a project machine's stages", () => {
    const stage = (machineStage?: "building" | "checking" | "installing") =>
      model({
        session: session("preparing", {
          projectMachine: true,
          ...(machineStage === undefined ? {} : { machineStage }),
        }),
      }).currentStep.label;
    expect(stage()).toBe("Starting machine");
    expect(stage("building")).toBe("Building machine");
    expect(stage("checking")).toBe("Checking machine");
    expect(stage("installing")).toBe("Installing Nexi");
    expect(model({ session: session("preparing", { machineSetup: true }) }).currentStep.label).toBe(
      "Checking out project",
    );
  });

  it("is still working, on the first step, before a session exists", () => {
    const m = model({ session: null });
    expect(m.currentStep.id).toBe("queued");
    expect(m.stage).toBe("working");
  });

  it("is ready, with every step done, as soon as the session is ready and nothing is waiting", () => {
    const done = model({ session: session("ready") });
    expect(done.stage).toBe("ready");
    expect(done.steps.every((s) => s.status === "done")).toBe(true);
    expect(done.steps.map((s) => s.id)).not.toContain("connect");
  });

  it("is on Connect while a waiting message's machine is not yet connected", () => {
    const m = model({ session: session("ready"), delivery: "queued" });
    expect(m.stage).toBe("working");
    expect(m.currentStep.id).toBe("connect");
    expect(m.activity).toBe("Connecting to cloud session…");
  });

  it("adds the send step when a first message waits, and stays working until it is sent", () => {
    const m = model({
      session: session("ready"),
      machineConnected: true,
      projectReady: true,
      delivery: "queued",
    });
    expect(m.stage).toBe("working");
    expect(m.currentStep.id).toBe("sent");
    expect(m.steps.map((s) => s.id)).toEqual([
      "queued",
      "machine",
      "server",
      "connect",
      "project",
      "sent",
    ]);
    expect(model({ session: session("ready"), delivery: "sending" }).currentStep.id).toBe("sent");
  });

  it("reports a failure with its reason and where to look", () => {
    const m = model({
      session: session("failed", { failureReason: "Out of capacity", detailsUrl: "https://x/y" }),
    });
    expect(m.stage).toBe("failed");
    expect(m.failureReason).toBe("Out of capacity");
    expect(m.detailsUrl).toBe("https://x/y");
  });

  it("does not call a session that has not shown up yet a failure", () => {
    const m = model({ session: null, lost: true });
    expect(m.stage).toBe("working");
    expect(m.notSeen).toBe(true);
    expect(m.failureReason).toBeNull();
    expect(m.title).toBe("Setting up your cloud session");
    expect(m.activity).toBe(CLOUD_SETUP_NOT_SEEN_NOTE);
    expect(model({ session: null, lost: false }).notSeen).toBe(false);
    expect(model({ session: session("preparing"), lost: true }).notSeen).toBe(false);
  });

  it("still fails on positive evidence: a terminal phase or a parked send", () => {
    expect(model({ session: session("stopped") }).stage).toBe("failed");
    expect(model({ session: session("preparing"), sendFailure: "gave up" }).stage).toBe("failed");
  });
});

describe("cloudSessionNotSeenYet", () => {
  const input = {
    loading: false,
    loadError: null,
    refreshFailed: false,
    sessionId: "s1",
    session: null,
  };
  it("counts a session as missing only from a list that answered", () => {
    expect(cloudSessionNotSeenYet(input)).toBe(true);
    expect(cloudSessionNotSeenYet({ ...input, loading: true })).toBe(false);
    // A list that failed or was rate limited says nothing about the session.
    expect(cloudSessionNotSeenYet({ ...input, loadError: "rate limited" })).toBe(false);
    // A refresh that failed after an earlier answer leaves stale rows: still no evidence.
    expect(cloudSessionNotSeenYet({ ...input, refreshFailed: true })).toBe(false);
    expect(cloudSessionNotSeenYet({ ...input, sessionId: null })).toBe(false);
    expect(cloudSessionNotSeenYet({ ...input, session: session("queued") })).toBe(false);
  });
});

describe("recovery", () => {
  const recovery = (input: Partial<Parameters<typeof cloudSetupRecovery>[0]>) =>
    cloudSetupRecovery({ session: null, lost: false, hasQueued: false, canRetry: false, ...input });

  it("never offers to retry a message at a session that has ended", () => {
    for (const phase of ["stopped", "cancelled", "failed"] as const) {
      expect(recovery({ session: session(phase), hasQueued: true, canRetry: true }).retry).toBe(
        false,
      );
    }
    expect(recovery({ lost: true, hasQueued: true, canRetry: true }).retry).toBe(false);
  });

  it("offers to retry a message only while its session is alive and the send can be retried", () => {
    expect(recovery({ session: session("ready"), hasQueued: true, canRetry: true }).retry).toBe(
      true,
    );
    expect(recovery({ session: session("ready"), hasQueued: true, canRetry: false }).retry).toBe(
      false,
    );
  });

  it("offers a fresh session only to a card with no waiting message, once its session is dead", () => {
    expect(recovery({ session: session("failed") }).tryAgain).toBe(true);
    expect(recovery({ lost: true }).tryAgain).toBe(true);
    expect(recovery({ session: session("failed"), hasQueued: true }).tryAgain).toBe(false);
    expect(recovery({ session: session("preparing") }).tryAgain).toBe(false);
  });
});

describe("notes", () => {
  it("explains repository setup honestly for a project machine", () => {
    const note = cloudSetupLongWaitNote(
      model({ session: session("preparing", { projectMachine: true }) }),
    );
    expect(note).toContain("cloning");
    expect(note).toContain("several minutes");
    expect(note).toContain("no time estimate");
  });

  it("claims no history it does not have", () => {
    const note = cloudSetupLongWaitNote(
      model({ session: session("preparing", { projectMachine: true }) }),
    );
    expect(note).not.toMatch(/first time|earlier sessions|usually/i);
  });

  it("stays quiet for a quick plain session", () => {
    expect(cloudSetupLongWaitNote(model({ session: session("preparing") }))).toBeNull();
  });

  it("says what the user can do meanwhile", () => {
    expect(cloudSetupMeanwhileNote(model({ session: session("preparing") }))).toContain("type");
    expect(
      cloudSetupMeanwhileNote(model({ session: session("preparing"), delivery: "queued" })),
    ).toContain("waiting");
    expect(
      cloudSetupMeanwhileNote(model({ session: session("ready"), delivery: "sending" })),
    ).toBeNull();
  });

  it("only says everything is in place once the machine is connected", () => {
    expect(cloudSetupReadyNote(model({ session: session("ready") }))).not.toContain(
      "Everything is in place",
    );
    expect(cloudSetupReadyNote(model({ session: session("ready") }))).toContain("connect");
    expect(
      cloudSetupReadyNote(model({ session: session("ready"), machineConnected: true })),
    ).toContain("Everything is in place");
  });
});
