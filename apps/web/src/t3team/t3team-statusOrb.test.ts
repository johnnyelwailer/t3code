import { describe, expect, it } from "vite-plus/test";

import { resolveStatusOrbState, STATUS_ORB_CLASS } from "./t3team-statusOrb";

describe("resolveStatusOrbState", () => {
  it("maps the deterministic activity state word 1:1 (it is already a DotState)", () => {
    for (const state of ["thinking", "writing", "working", "waiting"] as const) {
      expect(resolveStatusOrbState({ label: "Working", activityState: state })).toBe(state);
    }
  });

  it("a present activity state wins over the stable label", () => {
    expect(resolveStatusOrbState({ label: "Completed", activityState: "working" })).toBe("working");
    expect(resolveStatusOrbState({ label: "Working", activityState: null })).toBe("working");
  });

  it("maps the stable status labels onto the orb vocabulary", () => {
    const working: Record<string, string> = {
      Working: "working",
      Connecting: "working",
      Monitoring: "working",
      Running: "working",
    };
    for (const [label, expected] of Object.entries(working)) {
      expect(resolveStatusOrbState({ label }), label).toBe(expected);
    }
    for (const label of ["Completed", "Complete"]) {
      expect(resolveStatusOrbState({ label }), label).toBe("done");
    }
    for (const label of ["Needs attention", "Failed", "Error"]) {
      expect(resolveStatusOrbState({ label }), label).toBe("error");
    }
    for (const label of [
      "Pending Approval",
      "Awaiting Input",
      "Plan Ready",
      "Waiting for your answer",
      "Waiting for agent",
    ]) {
      expect(resolveStatusOrbState({ label }), label).toBe("waiting");
    }
    for (const label of ["Queued", "Scheduled", "Paused", "Stopped", "Idle", "Sleeping"]) {
      expect(resolveStatusOrbState({ label }), label).toBe("settled");
    }
  });

  it("fails open: unknown labels / missing pills keep their legacy dot (null)", () => {
    expect(resolveStatusOrbState(null)).toBeNull();
    expect(resolveStatusOrbState(undefined)).toBeNull();
    expect(resolveStatusOrbState({ label: "Some future label" })).toBeNull();
  });
});

describe("STATUS_ORB_CLASS", () => {
  it("is the shared class t3team-statusOrb.css paints", () => {
    expect(STATUS_ORB_CLASS).toBe("t3team-orb");
  });
});
