import type { ProjectMachineDefinition, ProjectMachineDiscovery } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { presentProjectMachine } from "./t3team-cloudSessionMachinePresentation";

const definition = (repository: string): ProjectMachineDefinition => ({
  repository,
  devcontainerPath: ".devcontainer/devcontainer.json",
  machineFilePath: null,
  healthCheck: null,
  secrets: [],
  hash: `sha256:${"0".repeat(64)}`,
});

const detected = (repository: string): ProjectMachineDiscovery => ({
  status: { _tag: "Detected", definition: definition(repository) },
  candidates: [definition(repository)],
  rejected: [],
});

describe("presentProjectMachine", () => {
  it("names the linked repository whose devcontainer the session runs in", () => {
    expect(presentProjectMachine(detected("acme/api"))).toEqual({
      label: "In the api machine",
      detail: "Runs in the devcontainer .devcontainer/devcontainer.json from acme/api.",
      tone: "info",
    });
    expect(presentProjectMachine(detected("."))?.label).toBe("In this project's machine");
  });

  it("says nothing for a project without a definition", () => {
    expect(
      presentProjectMachine({ status: { _tag: "None" }, candidates: [], rejected: [] }),
    ).toBeNull();
  });

  it("warns about a broken definition instead of promising a plain session", () => {
    const hint = presentProjectMachine({
      status: { _tag: "None" },
      candidates: [],
      rejected: [{ repository: ".", path: ".nexi/machine.json", reason: "is not valid." }],
    });
    expect(hint).toEqual({
      label: "Machine needs fixing",
      detail: ".nexi/machine.json: is not valid.",
      tone: "warning",
    });
  });

  it("shows remote search guidance without marking a missing definition as broken", () => {
    const reason =
      "A subfolder devcontainer needs a local checkout or a .nexi/machine.json pointer.";
    expect(
      presentProjectMachine({ status: { _tag: "None", reason }, candidates: [], rejected: [] }),
    ).toEqual({ label: "No remote machine found", detail: reason, tone: "info" });
  });
});
