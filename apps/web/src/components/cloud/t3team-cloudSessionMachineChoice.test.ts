import type { ProjectMachineDiscovery } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cloudSessionMachineChoice } from "./t3team-cloudSessionMachineChoice";

const none: ProjectMachineDiscovery = { status: { _tag: "None" }, candidates: [], rejected: [] };
const detected = {
  status: {
    _tag: "Detected",
    definition: {
      repository: ".",
      devcontainerPath: ".devcontainer/devcontainer.json",
      source: "machine-file",
      files: [".nexi/machine.json"],
      healthCheck: "true",
      secrets: [],
    },
  },
  candidates: [],
  rejected: [],
} as unknown as ProjectMachineDiscovery;
const rejected: ProjectMachineDiscovery = {
  ...none,
  rejected: [{ repository: ".", path: ".nexi/machine.json", reason: "version must be 1" }],
};

describe("cloudSessionMachineChoice", () => {
  it("sets a machine up when the project has none and setup is on", () => {
    expect(cloudSessionMachineChoice({ discovery: none, setupEnabled: true })).toBe("setup");
  });

  it("starts a plain session when setup is off", () => {
    expect(cloudSessionMachineChoice({ discovery: none, setupEnabled: false })).toBe("start");
  });

  it("starts in the machine when one is defined", () => {
    expect(cloudSessionMachineChoice({ discovery: detected, setupEnabled: true })).toBe("start");
  });

  it("refuses to start while a committed definition is rejected, flag or not", () => {
    expect(cloudSessionMachineChoice({ discovery: rejected, setupEnabled: true })).toBe("fix");
    expect(cloudSessionMachineChoice({ discovery: rejected, setupEnabled: false })).toBe("fix");
  });

  it("leaves the decision to the server while discovery has not answered", () => {
    expect(cloudSessionMachineChoice({ discovery: null, setupEnabled: true })).toBe("start");
  });
});
