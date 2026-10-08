import type { EnvironmentSetupProfile, ServerConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { listT3TeamSetupWelcomeSteps } from "~/t3team/t3team-SetupWelcomeSteps";
import {
  isT3TeamWorkProfileChooserEnabled,
  resolveT3TeamDeveloperSetupProfileId,
} from "~/t3team/t3team-workProfileChooser";

const config = (value: boolean | undefined): ServerConfig =>
  (value === undefined ? {} : { workProfileChooser: value }) as ServerConfig;

const descriptor = (id: string, category: string): EnvironmentSetupProfile =>
  ({
    id,
    title: id,
    description: id,
    badge: "Badge",
    bullets: ["one"],
    category,
  }) as EnvironmentSetupProfile;

describe("work profile chooser gate", () => {
  it("treats a missing field and a missing config as off", () => {
    expect(isT3TeamWorkProfileChooserEnabled(config(true))).toBe(true);
    expect(isT3TeamWorkProfileChooserEnabled(config(false))).toBe(false);
    // Older servers do not advertise the field at all.
    expect(isT3TeamWorkProfileChooserEnabled(config(undefined))).toBe(false);
    expect(isT3TeamWorkProfileChooserEnabled(null)).toBe(false);
  });

  it("resolves the developer profile as the first engineering pack profile", () => {
    expect(
      resolveT3TeamDeveloperSetupProfileId([
        descriptor("requirements-product", "product"),
        descriptor("engineer", "engineering"),
        descriptor("cloud-engineer", "engineering"),
      ]),
    ).toBe("engineer");
    expect(resolveT3TeamDeveloperSetupProfileId([descriptor("only-product", "product")])).toBe(
      "engineering-copilot",
    );
    expect(resolveT3TeamDeveloperSetupProfileId(undefined)).toBe("engineering-copilot");
  });
});

describe("surfaces gated by the chooser", () => {
  it("renumbers the welcome steps when the profile step is dropped", () => {
    expect(listT3TeamSetupWelcomeSteps(true).map((item) => [item.step, item.title])).toEqual([
      ["01", "Pick your style"],
      ["02", "Connect Jira"],
      ["03", "Start working"],
    ]);
    expect(listT3TeamSetupWelcomeSteps(false).map((item) => [item.step, item.title])).toEqual([
      ["01", "Connect Jira"],
      ["02", "Start working"],
    ]);
  });
});
