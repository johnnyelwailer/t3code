import { describe, expect, it } from "vite-plus/test";

import {
  isWorkSourceStep,
  nextWelcomeWizardStep,
  welcomeWizardStages,
  type WelcomeWizardStep,
} from "./t3team-welcomeWizardFlow";

describe("welcomeWizardStages", () => {
  it("keeps the standard flow, ending in the Claude Code / Codex import, while the flag is off", () => {
    const stages = welcomeWizardStages(false);
    expect(stages.map((stage) => stage.step)).toEqual(["connection", "agents", "import"]);
    expect(nextWelcomeWizardStep(stages, "agents")).toBe("import");
  });

  it("replaces the import with Jira, a first project and GitHub for a work-source first run", () => {
    const stages = welcomeWizardStages(true);
    expect(stages.map((stage) => stage.label)).toEqual([
      "Connect",
      "Agents",
      "Jira",
      "Project",
      "GitHub",
    ]);
    expect(stages.some((stage) => stage.step === "import")).toBe(false);
    expect(nextWelcomeWizardStep(stages, "agents")).toBe("jira");
    expect(nextWelcomeWizardStep(stages, "jira")).toBe("first-project");
    expect(nextWelcomeWizardStep(stages, "first-project")).toBe("github");
    expect(nextWelcomeWizardStep(stages, "github")).toBeNull();
  });

  it("tells the work-source steps apart from the upstream ones", () => {
    const upstream: ReadonlyArray<WelcomeWizardStep> = ["connection", "agents", "import"];
    expect(upstream.some(isWorkSourceStep)).toBe(false);
    expect(isWorkSourceStep("github")).toBe(true);
  });
});
