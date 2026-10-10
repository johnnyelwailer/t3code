import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  canContinueWithSelection,
  setupEnvironmentIds,
  shouldAutoSelectComputer,
  shouldAutoSelectDiscoveredComputer,
} from "./t3team-onboardingComputerSelection";

const computer = (id: string, phase: string) => ({
  environmentId: EnvironmentId.make(id),
  connection: { phase },
});

describe("onboarding computer selection", () => {
  it("auto-ticks only a computer it can reach", () => {
    expect(shouldAutoSelectComputer(computer("a", "connected"))).toBe(true);
    expect(shouldAutoSelectComputer(computer("b", "connecting"))).toBe(false);
    expect(shouldAutoSelectComputer(computer("c", "error"))).toBe(false);
    expect(shouldAutoSelectDiscoveredComputer("online")).toBe(true);
    expect(shouldAutoSelectDiscoveredComputer("offline")).toBe(false);
    expect(shouldAutoSelectDiscoveredComputer("error")).toBe(false);
  });

  it("lets the user continue past an unreachable computer they ticked", () => {
    const environments = [computer("ok", "connected"), computer("down", "error")];
    const both = new Set([EnvironmentId.make("ok"), EnvironmentId.make("down")]);
    expect(canContinueWithSelection(both, environments)).toBe(true);
    // …and setup then runs on the reachable one only, so no step waits on it.
    expect(setupEnvironmentIds(both, environments)).toEqual([EnvironmentId.make("ok")]);
  });

  it("still needs at least one connected computer", () => {
    const environments = [computer("ok", "connected"), computer("down", "error")];
    expect(canContinueWithSelection(new Set([EnvironmentId.make("down")]), environments)).toBe(
      false,
    );
    expect(canContinueWithSelection(new Set(), environments)).toBe(false);
  });
});
