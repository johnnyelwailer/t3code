import type { CloudSession, CloudSessionTiming } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildCloudSessionSetup,
  CLOUD_SETUP_PROGRESS_CEILING,
  cloudSetupElapsedSeconds,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
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

const MEASURED: CloudSessionTiming = {
  samples: 5,
  scope: "project",
  readyLowSeconds: 200,
  readyTypicalSeconds: 300,
  readyHighSeconds: 420,
  startsAtSeconds: { preparing: 10, building: 60, checking: 200, installing: 230, starting: 270 },
};

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
    expect(model({ session: session("stopped"), delivery: "queued" }).stage).toBe("failed");
  });

  it("does not claim a missing session is reserving a machine", () => {
    expect(model({ session: null, delivery: "queued" }).activity).toBe(
      "Waiting for cloud session status…",
    );
  });
  it("walks a plain session through three steps in user words", () => {
    const m = model({ session: session("preparing") });
    expect(m.steps.map((s) => [s.label, s.status])).toEqual([
      ["Reserving a machine", "done"],
      ["Preparing your workspace", "current"],
      ["Starting Nexi", "upcoming"],
    ]);
    expect(m.shape).toBe("plain");
  });

  it("uses no pipeline jargon in any label or activity", () => {
    for (const phase of ["requested", "queued", "preparing", "starting", "ready"] as const) {
      for (const extra of [{}, { projectMachine: true }, { machineSetup: true }]) {
        const m = model({ session: session(phase, extra) });
        const words = [...m.steps.map((s) => s.label), m.activity, m.title].join(" ");
        expect(words).not.toMatch(/broker|pairing|workflow|runner|job|relay|devcontainer/i);
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
    expect(stage()).toBe("Fetching your repository");
    expect(stage("building")).toBe("Building your project's machine");
    expect(stage("checking")).toBe("Checking the machine");
    expect(stage("installing")).toBe("Installing Nexi");
  });

  it("shows the creating state before a session exists", () => {
    const m = model({ session: null });
    expect(m.currentStep.id).toBe("reserve");
    expect(m.stage).toBe("working");
  });

  it("is ready, with every step done, as soon as the session is ready and nothing is waiting", () => {
    const done = model({ session: session("ready") });
    expect(done.stage).toBe("ready");
    expect(done.steps.every((s) => s.status === "done")).toBe(true);
    expect(done.steps.map((s) => s.id)).not.toContain("connect");
  });

  it("is on Connecting while a waiting message's machine is not yet connected", () => {
    const m = model({ session: session("ready"), delivery: "queued" });
    expect(m.stage).toBe("working");
    expect(m.currentStep.id).toBe("connect");
  });

  it("adds a sending step when a first message waits, and stays working until it is sent", () => {
    const m = model({
      session: session("ready"),
      machineConnected: true,
      delivery: "queued",
    });
    expect(m.stage).toBe("working");
    expect(m.currentStep.id).toBe("deliver");
    expect(m.steps.at(-1)?.label).toBe("Sending your message");
  });

  it("reports a failure with its reason and no current step claims", () => {
    const m = model({
      session: session("failed", { failureReason: "Out of capacity", detailsUrl: "https://x/y" }),
    });
    expect(m.stage).toBe("failed");
    expect(m.failureReason).toBe("Out of capacity");
    expect(m.detailsUrl).toBe("https://x/y");
  });
});

describe("estimates", () => {
  it("falls back to constants and says so", () => {
    const m = model({ session: session("preparing") });
    expect(m.measured).toBe(false);
    expect(readCloudSetup(m, 20).basisText).toMatch(/^Usually/);
    const machine = model({ session: session("preparing", { projectMachine: true }) });
    expect(readCloudSetup(machine, 20).basisText).toMatch(/^Rough guess/);
  });

  it("prefers the server's measurement and says what it is based on", () => {
    const m = model({ session: session("preparing", { projectMachine: true, timing: MEASURED }) });
    expect(m.measured).toBe(true);
    expect(readCloudSetup(m, 100).basisText).toBe(
      "Usually 3–7 min, from your last 5 sessions of this project",
    );
  });

  it("gives a range, not a point, early on", () => {
    const m = model({ session: session("preparing") });
    expect(readCloudSetup(m, 15).estimateText).toMatch(
      /^About \d+–\d+ min left$|^About a minute left$/,
    );
  });

  it("never shows zero or a countdown that finished while still working", () => {
    const m = model({ session: session("starting") });
    for (let t = 0; t <= m.timing.readyHighSeconds; t += 5) {
      const readout = readCloudSetup(m, t);
      expect(readout.estimateText).not.toMatch(/\b0 min|Taking longer/);
      expect(readout.remaining?.highSeconds ?? 0).toBeGreaterThan(0);
    }
  });

  it("says it is taking longer than usual past the slow end, with no countdown", () => {
    const m = model({ session: session("preparing") });
    const late = readCloudSetup(m, m.timing.readyHighSeconds + 1);
    expect(late.slow).toBe(true);
    expect(late.remaining).toBeNull();
    expect(late.estimateText).toBe("Taking longer than usual");
    expect(late.valueText).toContain("Preparing your workspace");
    expect(late.progress).toBeLessThan(1);
  });

  it("formats ranges with friendly numbers", () => {
    expect(formatCloudSetupRemaining(10, 40)).toBe("Less than a minute left");
    expect(formatCloudSetupRemaining(20, 80)).toBe("About a minute left");
    expect(formatCloudSetupRemaining(50, 120)).toBe("About 1–2 min left");
    expect(formatCloudSetupRemaining(110, 120)).toBe("About 2 min left");
    expect(formatCloudSetupRemaining(10, 130)).toBe("About 1–3 min left");
    expect(formatCloudSetupRemaining(600, 1200)).toBe("About 10–20 min left");
  });

  it("measures the clock from the snapshot's own elapsed time", () => {
    expect(cloudSetupElapsedSeconds(40, 1_000, 6_000)).toBe(45);
    expect(cloudSetupElapsedSeconds(40, 6_000, 1_000)).toBe(40);
  });
});

describe("progress", () => {
  const shapes: Array<[string, Partial<CloudSession>]> = [
    ["plain", {}],
    ["machine", { projectMachine: true }],
    ["setup", { machineSetup: true }],
    ["measured machine", { projectMachine: true, timing: MEASURED }],
  ];

  it("is monotonic over time and stays below the ceiling until ready", () => {
    for (const [, extra] of shapes) {
      for (const phase of ["queued", "preparing", "starting"] as const) {
        const m = model({ session: session(phase, extra) });
        let previous = -1;
        for (let t = 0; t <= 4000; t += 7) {
          const { progress, motion } = readCloudSetup(m, t);
          expect(progress).toBeGreaterThanOrEqual(previous);
          expect(progress).toBeLessThan(1);
          expect(motion.to).toBeLessThan(1);
          expect(motion.to).toBeGreaterThanOrEqual(motion.from);
          previous = progress;
        }
      }
    }
  });

  it("does not move backwards when the next step begins", () => {
    for (const [, extra] of shapes) {
      const shape = model({ session: session("queued", extra) }).shape;
      const phases: Array<[CloudSession["phase"], CloudSession["machineStage"]?]> = [
        ["queued"],
        ["preparing"],
        ...(shape === "machine"
          ? ([
              ["preparing", "building"],
              ["preparing", "checking"],
              ["preparing", "installing"],
            ] as Array<[CloudSession["phase"], CloudSession["machineStage"]]>)
          : []),
        ["starting"],
        ["ready"],
      ];
      for (const t of [0, 5, 40, 90, 200, 330, 900]) {
        let flattenedAt = -1;
        for (const [phase, machineStage] of phases) {
          const readout = readCloudSetup(
            model({
              session: session(phase, {
                ...extra,
                ...(machineStage === undefined ? {} : { machineStage }),
              }),
            }),
            t,
          );
          // Whatever step the next poll reports starts no lower than where the last one can reach.
          expect(readout.motion.from).toBeGreaterThanOrEqual(flattenedAt - 1e-9);
          flattenedAt = readout.motion.to;
        }
      }
    }
  });

  it("restarts from a higher position on a step change at the same instant", () => {
    const early = readCloudSetup(model({ session: session("preparing") }), 40);
    const next = readCloudSetup(model({ session: session("starting") }), 40);
    expect(next.progress).toBeGreaterThanOrEqual(early.motion.to - 1e-9);
  });

  it("reaches 1 only when the session is ready", () => {
    const m = model({ session: session("ready") });
    expect(readCloudSetup(m, 100).progress).toBe(1);
    const pending = model({ session: session("ready"), delivery: "queued" });
    expect(readCloudSetup(pending, 10_000).progress).toBeLessThan(1);
    expect(CLOUD_SETUP_PROGRESS_CEILING).toBeLessThan(1);
  });

  it("hands CSS an easing curve that runs 0 to 1 over the remaining time", () => {
    const { motion } = readCloudSetup(model({ session: session("preparing") }), 20);
    expect(motion.durationSeconds).toBeGreaterThan(0);
    expect(motion.easing[0]).toBe(0);
    expect(motion.easing.at(-1)).toBeCloseTo(1, 5);
    expect([...motion.easing].sort((a, b) => a - b)).toEqual([...motion.easing]);
  });

  it("has nothing left to animate once a step's curve has flattened", () => {
    const { motion } = readCloudSetup(model({ session: session("preparing") }), 5000);
    expect(motion.durationSeconds).toBe(0);
    expect(motion.from).toBe(motion.to);
  });
});

describe("notes", () => {
  it("explains repository setup honestly for a project machine", () => {
    const note = cloudSetupLongWaitNote(
      model({ session: session("preparing", { projectMachine: true }) }),
    );
    expect(note).toContain("cloning");
    expect(note).toContain("several minutes");
  });

  it("does not claim a first-time cost when the project has history", () => {
    const note = cloudSetupLongWaitNote(
      model({ session: session("preparing", { projectMachine: true, timing: MEASURED }) }),
    );
    expect(note).not.toContain("first time");
    expect(note).not.toContain("The first time");
  });

  it("stays quiet for a quick plain session", () => {
    expect(cloudSetupLongWaitNote(model({ session: session("preparing") }))).toBeNull();
  });

  it("says what the user can do meanwhile", () => {
    expect(cloudSetupMeanwhileNote(model({ session: session("preparing") }))).toContain("type");
    expect(
      cloudSetupMeanwhileNote(model({ session: session("preparing"), delivery: "queued" })),
    ).toContain("waiting");
  });
});
