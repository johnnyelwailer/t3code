/**
 * The welcome wizard's stages. The standard flow ends by importing Claude Code / Codex history;
 * with `FIRST_RUN_WORK_SOURCE` on it ends with the work-source steps instead: Jira, a first
 * project from it, and GitHub (optional), the steps that used to live on the first-project screen.
 */
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

export type T3TeamWorkSourceStep = "jira" | "first-project" | "github";
export type WelcomeWizardStep = "connection" | "agents" | "import" | T3TeamWorkSourceStep;

export interface WelcomeWizardStage {
  readonly step: WelcomeWizardStep;
  readonly label: string;
}

const STANDARD_STAGES: ReadonlyArray<WelcomeWizardStage> = [
  { step: "connection", label: "Connect" },
  { step: "agents", label: "Agents" },
  { step: "import", label: "Projects" },
];

const WORK_SOURCE_STAGES: ReadonlyArray<WelcomeWizardStage> = [
  { step: "connection", label: "Connect" },
  { step: "agents", label: "Agents" },
  { step: "jira", label: "Jira" },
  { step: "first-project", label: "Project" },
  { step: "github", label: "GitHub" },
];

export function welcomeWizardStages(workSource: boolean): ReadonlyArray<WelcomeWizardStage> {
  return workSource ? WORK_SOURCE_STAGES : STANDARD_STAGES;
}

/** The stage after `step`, or `null` for the last one. */
export function nextWelcomeWizardStep(
  stages: ReadonlyArray<WelcomeWizardStage>,
  step: WelcomeWizardStep,
): WelcomeWizardStep | null {
  const index = stages.findIndex((stage) => stage.step === step);
  return stages[index + 1]?.step ?? null;
}

export function isWorkSourceStep(step: WelcomeWizardStep): step is T3TeamWorkSourceStep {
  return step === "jira" || step === "first-project" || step === "github";
}

export function useWorkSourceFirstRun(): boolean {
  return useFeatureFlag("FIRST_RUN_WORK_SOURCE");
}
