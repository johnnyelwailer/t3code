import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  type CloudSessionListDemand,
  cloudSessionListWanted,
  environmentMayBeCloudSessionMachine,
} from "./t3team-cloudSessionListDemand";

const NOTHING: CloudSessionListDemand = {
  menuOpen: false,
  panelVisible: false,
  bound: false,
  creating: false,
  queuedSendPending: false,
  localSession: false,
  lingering: false,
};

describe("cloudSessionListWanted", () => {
  it("does not want the list for a plain local composer", () => {
    expect(cloudSessionListWanted(NOTHING)).toBe(false);
  });

  it.each(Object.keys(NOTHING) as ReadonlyArray<keyof CloudSessionListDemand>)(
    "wants the list for %s alone",
    (reason) => {
      expect(cloudSessionListWanted({ ...NOTHING, [reason]: true })).toBe(true);
    },
  );
});

describe("environmentMayBeCloudSessionMachine", () => {
  const primary = EnvironmentId.make("env-primary");
  const machine = EnvironmentId.make("env-machine");

  it("is never the primary environment", () => {
    expect(environmentMayBeCloudSessionMachine(primary, primary)).toBe(false);
  });

  it("is possible for another environment", () => {
    expect(environmentMayBeCloudSessionMachine(machine, primary)).toBe(true);
  });

  it("is unknown without an environment or before the primary one resolves", () => {
    expect(environmentMayBeCloudSessionMachine(null, primary)).toBe(false);
    expect(environmentMayBeCloudSessionMachine(machine, null)).toBe(false);
  });
});
