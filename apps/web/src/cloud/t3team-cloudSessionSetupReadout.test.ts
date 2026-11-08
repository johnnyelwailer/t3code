import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CLOUD_SESSION_ROUGH_READY_SECONDS } from "~/components/cloud/t3team-cloudSessionProvisionTiming";
import {
  buildCloudSessionSetup,
  cloudSetupElapsedSeconds,
  formatCloudSetupRemaining,
  readCloudSetup,
  type CloudSetupFacts,
} from "./t3team-cloudSessionSetupProgress";
import { classifyCloudProjectWait, type CloudProjectWaitInput } from "./t3team-cloudProjectWait";
import {
  CLOUD_PROJECT_WAIT_EXPECTED_SECONDS,
  CLOUD_PROJECT_WAIT_SLOW_SECONDS,
  presentCloudProjectWait,
} from "./t3team-cloudProjectWaitPresentation";

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
    expect(late.progress).toBeNull();
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
  const longWaits: Array<Partial<CloudSession>> = [
    { projectMachine: true },
    { machineSetup: true },
  ];

  it("is monotonic and below full for a plain session up to the rough estimate", () => {
    for (const phase of ["queued", "preparing", "starting"] as const) {
      const m = model({ session: session(phase) });
      let previous = -1;
      for (let t = 0; t <= ROUGH; t += 7) {
        const { progress } = readCloudSetup(m, t);
        expect(progress).not.toBeNull();
        expect(progress ?? 1).toBeGreaterThanOrEqual(previous);
        expect(progress ?? 1).toBeLessThan(1);
        previous = progress ?? 1;
      }
    }
  });

  it("claims no fraction past the rough estimate", () => {
    for (const t of [ROUGH + 1, 600, 4000]) {
      expect(readCloudSetup(model({ session: session("preparing") }), t).progress).toBeNull();
    }
  });

  it("never claims a fraction, or parks near full, for a long setup", () => {
    for (const extra of longWaits) {
      for (const phase of ["queued", "preparing", "starting"] as const) {
        const m = model({ session: session(phase, extra) });
        for (let t = 0; t <= 4000; t += 7) {
          expect(readCloudSetup(m, t).progress).toBeNull();
        }
      }
    }
  });

  it("does not move backwards when the next step begins", () => {
    const phases = ["queued", "preparing", "starting", "ready"] as const;
    for (const t of [0, 5, 40, 90, 140]) {
      const readings = phases.map(
        (phase) => readCloudSetup(model({ session: session(phase) }), t).progress ?? -1,
      );
      expect([...readings].sort((a, b) => a - b)).toEqual(readings);
    }
  });

  it("reaches full only when the session is ready and nothing waits", () => {
    expect(readCloudSetup(model({ session: session("ready") }), 100).progress).toBe(1);
    expect(
      readCloudSetup(model({ session: session("ready", { projectMachine: true }) }), 900).progress,
    ).toBe(1);
    const pending = model({ session: session("ready"), delivery: "queued" });
    expect(readCloudSetup(pending, 200).progress).toBeLessThan(1);
    expect(readCloudSetup(model({ session: null }), 10_000).progress).toBe(0);
  });
});

describe("progress while a message waits on the project", () => {
  const waiting = model({
    session: session("ready"),
    machineConnected: true,
    projectReady: false,
    delivery: "queued",
  });
  const notice = (seconds: number, over: Partial<CloudProjectWaitInput> = {}) =>
    presentCloudProjectWait(
      classifyCloudProjectWait({
        environmentId: EnvironmentId.make("env-cloud"),
        scratch: false,
        machineSettingsLoaded: true,
        expectedCwd: "/workspace/app",
        scratchRoot: null,
        composer: null,
        projects: [],
        ...over,
      }),
      seconds,
    );

  it("stays determinate, below full, in the short hand-off", () => {
    const { progress } = readCloudSetup(
      waiting,
      300,
      notice(CLOUD_PROJECT_WAIT_EXPECTED_SECONDS - 1),
    );
    expect(progress).not.toBeNull();
    expect(progress ?? 1).toBeLessThan(1);
  });

  it("claims no fraction once the project wait is past its expected point", () => {
    for (const seconds of [
      CLOUD_PROJECT_WAIT_EXPECTED_SECONDS,
      CLOUD_PROJECT_WAIT_SLOW_SECONDS,
      900,
    ]) {
      expect(readCloudSetup(waiting, 10_000, notice(seconds)).progress).toBeNull();
    }
  });

  it("claims no fraction for a wait that cannot end by waiting", () => {
    const blocking = notice(0, { scratch: true, scratchRoot: null });
    expect(blocking.blocking).toBe(true);
    expect(readCloudSetup(waiting, 300, blocking).progress).toBeNull();
  });
});
