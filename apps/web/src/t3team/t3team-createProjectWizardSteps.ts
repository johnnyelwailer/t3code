import type { CreateProjectStep } from "~/t3team/hooks/t3team-useCreateProject";

/**
 * The navigable steps of the add-project wizard, in order. `creating` is deliberately absent: it
 * is terminal and has no back/continue of its own.
 *
 * Single source of truth for both directions, so the `profile` step disappearing with the
 * `WORK_PROFILE_CHOOSER` flag off (see `t3team-workProfileChooser.ts`) cannot leave a dead
 * back-link behind — `project` continues straight to `repositories`, and `repositories` goes back
 * to `project`.
 */
const WIZARD_STEPS = [
  "source",
  "account",
  "project",
  "profile",
  "repositories",
  "review",
] as const satisfies ReadonlyArray<CreateProjectStep>;

export function listT3TeamCreateProjectWizardSteps(
  workProfileChooserEnabled: boolean,
): ReadonlyArray<CreateProjectStep> {
  if (workProfileChooserEnabled) return WIZARD_STEPS;
  return WIZARD_STEPS.filter((step) => step !== "profile");
}

/** The step before/after `step`, or undefined at either end (or for a non-navigable step). */
export function t3teamCreateProjectWizardStepNeighbour(
  step: CreateProjectStep,
  workProfileChooserEnabled: boolean,
  direction: 1 | -1,
): CreateProjectStep | undefined {
  const steps = listT3TeamCreateProjectWizardSteps(workProfileChooserEnabled);
  const index = steps.indexOf(step);
  if (index < 0) return undefined;
  return steps[index + direction];
}
