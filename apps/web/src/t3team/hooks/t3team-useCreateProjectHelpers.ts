import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import type { Dispatch, SetStateAction } from "react";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import type { CreateProjectStep } from "./t3team-useCreateProject";
import { pickPreferredAccount } from "./t3team-createProjectUtils";

export function failWithStep(
  setError: Dispatch<SetStateAction<string | null>>,
  setStep: Dispatch<SetStateAction<CreateProjectStep>>,
  value: unknown,
  fallback: string,
  nextStep: CreateProjectStep = "source",
): void {
  setError(value instanceof Error ? value.message : fallback);
  setStep(nextStep);
}

const STEP_ORDER: ReadonlyArray<CreateProjectStep> = [
  "source",
  "account",
  "project",
  "profile",
  "repositories",
  "review",
  "creating",
];

/**
 * Moves `setStep` to `target` only if that is actually a forward move relative to whatever
 * step is live right now. A resolved background promise (account refresh, bootstrap project
 * load) must never yank the user backwards out of a step they already advanced past while it
 * was in flight. `onAdvance` runs only when the move is genuinely forward, so a stale response
 * can't clear state (e.g. the project list) the user is actively interacting with either.
 */
export function advanceStepForward(
  setStep: Dispatch<SetStateAction<CreateProjectStep>>,
  target: CreateProjectStep,
  onAdvance?: () => void,
): void {
  setStep((cur) => {
    if (STEP_ORDER.indexOf(target) <= STEP_ORDER.indexOf(cur)) return cur;
    onAdvance?.();
    return target;
  });
}

export function applyLoadedAccounts(input: {
  loadedAccounts: ReadonlyArray<IntegrationAccount>;
  setAccounts: Dispatch<SetStateAction<ReadonlyArray<IntegrationAccount>>>;
  setSelectedProject: (project: ExternalProject | null) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<CreateProjectStep>>;
  setSelectedAccount: Dispatch<SetStateAction<IntegrationAccount | null>>;
}): IntegrationAccount | null {
  input.setAccounts(input.loadedAccounts);
  input.setSelectedProject(null);
  if (input.loadedAccounts.length === 0) {
    input.setError("No Atlassian sites found.");
    input.setStep("source");
    return null;
  }

  const preferredAccount = pickPreferredAccount(input.loadedAccounts);
  runT3TeamViewTransition(
    () => {
      input.setSelectedAccount(preferredAccount);
      input.setStep("account");
    },
    { types: ["t3team-wizard-forward"] },
  );
  return preferredAccount;
}
