import { describe, expect, it } from "vite-plus/test";

import {
  describeMachineSource,
  machineSourceFormValues,
  machineSourceFromForm,
} from "./t3team-projectMachineSourceText";

const readout = (
  override: { repository?: string; branch?: string } | null,
  branch: string | null,
) => ({
  repository: "acme/tools",
  host: "nexplore.ghe.com",
  branch,
  commit: null,
  override,
});

describe("machine source form", () => {
  it("saves nothing but the filled fields, and both empty resets to the default", () => {
    expect(machineSourceFromForm({ repository: " ", branch: "" })).toBeNull();
    expect(machineSourceFromForm({ repository: "acme/tools", branch: "" })).toEqual({
      repository: "acme/tools",
    });
    expect(machineSourceFromForm({ repository: "", branch: " setup " })).toEqual({
      branch: "setup",
    });
  });

  it("fills the form from the saved choice, empty for the default", () => {
    expect(machineSourceFormValues(readout(null, null))).toEqual({ repository: "", branch: "" });
    expect(
      machineSourceFormValues(
        readout(
          { repository: "https://nexplore.ghe.com/acme/tools.git", branch: "setup" },
          "setup",
        ),
      ),
    ).toEqual({ repository: "https://nexplore.ghe.com/acme/tools.git", branch: "setup" });
  });

  it("says where the definition comes from", () => {
    expect(describeMachineSource(readout(null, null))).toBe(
      "acme/tools · default branch (this project's repository)",
    );
    expect(
      describeMachineSource(
        readout({ repository: "https://h/acme/tools.git", branch: "setup" }, "setup"),
      ),
    ).toBe("acme/tools · branch setup");
    expect(describeMachineSource(undefined)).toContain("no repository");
  });
});
