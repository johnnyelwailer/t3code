import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CLOUD_SESSION_ROUGH_READY_SECONDS } from "~/components/cloud/t3team-cloudSessionProvisionTiming";
import {
  buildCloudSessionSetup,
  CLOUD_SETUP_LOST_MESSAGE,
  cloudSetupElapsedSeconds,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
  cloudSetupReadyNote,
  cloudSetupRecovery,
  formatCloudSetupRemaining,
  readCloudSetup,
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

const ROUGH = CLOUD_SESSION_ROUGH_READY_SECONDS;

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

  it("names the problem once a session has stayed out of the list too long", () => {
    const m = model({ session: null, lost: true });
    expect(m.stage).toBe("failed");
    expect(m.failureReason).toBe(CLOUD_SETUP_LOST_MESSAGE);
    expect(model({ session: session("preparing"), lost: true }).stage).toBe("working");
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

describe("estimates", () => {
  it("labels the only estimate as rough for a plain session", () => {
    const readout = readCloudSetup(model({ session: session("preparing") }), 20);
    expect(readout.basisText).toBe("Rough estimate, not measured for this session");
    expect(readout.estimateText).toBe(formatCloudSetupRemaining(ROUGH - 20));
  });

  it("gives a project machine its elapsed time and no estimate", () => {
    for (const extra of [{ projectMachine: true }, { machineSetup: true }]) {
      const readout = readCloudSetup(model({ session: session("preparing", extra) }), 100);
      expect(readout.estimateText).toBe("1m 40s so far");
      expect(readout.basisText).toBeNull();
      expect(readout.remaining).toBeNull();
      expect(readout.slow).toBe(false);
    }
  });

  it("never gives a range", () => {
    const m = model({ session: session("preparing") });
    for (let t = 0; t <= ROUGH; t += 5) {
      expect(readCloudSetup(m, t).estimateText).not.toMatch(/–|-/);
    }
  });

  it("never shows zero while still working", () => {
    const m = model({ session: session("starting") });
    for (let t = 0; t <= ROUGH; t += 5) {
      const readout = readCloudSetup(m, t);
      expect(readout.estimateText).not.toMatch(/\b0 min|Taking longer/);
      expect(readout.remaining ?? 0).toBeGreaterThan(0);
    }
  });

  it("says it is taking longer than the rough estimate past it, with no countdown", () => {
    const m = model({ session: session("preparing") });
    const late = readCloudSetup(m, ROUGH + 1);
    expect(late.slow).toBe(true);
    expect(late.remaining).toBeNull();
    expect(late.basisText).toBeNull();
    expect(late.estimateText).toBe("Taking longer than the rough estimate");
    expect(late.valueText).toContain("Building workspace");
    expect(late.progress).toBeLessThan(1);
  });

  it("says it waits for status while there is no session", () => {
    const readout = readCloudSetup(model({ session: null }), 30);
    expect(readout.estimateText).toBe("Waiting for session status");
    expect(readout.basisText).toBeNull();
  });

  it("formats the time left as one friendly figure", () => {
    expect(formatCloudSetupRemaining(40)).toBe("Less than a minute left");
    expect(formatCloudSetupRemaining(80)).toBe("About a minute left");
    expect(formatCloudSetupRemaining(120)).toBe("About 2 min left");
    expect(formatCloudSetupRemaining(130)).toBe("About 3 min left");
    expect(formatCloudSetupRemaining(1200)).toBe("About 20 min left");
  });

  it("measures the clock from the snapshot's own elapsed time", () => {
    expect(cloudSetupElapsedSeconds(40, 1_000, 6_000)).toBe(45);
    expect(cloudSetupElapsedSeconds(40, 6_000, 1_000)).toBe(40);
  });
});

describe("progress", () => {
  const shapes: Array<Partial<CloudSession>> = [
    {},
    { projectMachine: true },
    { machineSetup: true },
  ];

  it("is monotonic over time and stays below full until ready", () => {
    for (const extra of shapes) {
      for (const phase of ["queued", "preparing", "starting"] as const) {
        const m = model({ session: session(phase, extra) });
        let previous = -1;
        for (let t = 0; t <= 4000; t += 7) {
          const { progress } = readCloudSetup(m, t);
          expect(progress).toBeGreaterThanOrEqual(previous);
          expect(progress).toBeLessThan(1);
          previous = progress;
        }
      }
    }
  });

  it("does not move backwards when the next step begins", () => {
    const phases = ["queued", "preparing", "starting", "ready"] as const;
    for (const extra of shapes) {
      for (const t of [0, 5, 40, 90, 200, 330, 900]) {
        const readings = phases.map(
          (phase) => readCloudSetup(model({ session: session(phase, extra) }), t).progress,
        );
        expect([...readings].sort((a, b) => a - b)).toEqual(readings);
      }
    }
  });

  it("reaches full only when the session is ready and nothing waits", () => {
    expect(readCloudSetup(model({ session: session("ready") }), 100).progress).toBe(1);
    const pending = model({ session: session("ready"), delivery: "queued" });
    expect(readCloudSetup(pending, 10_000).progress).toBeLessThan(1);
    expect(readCloudSetup(model({ session: null }), 10_000).progress).toBe(0);
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
