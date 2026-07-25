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

export function applyLoadedAccounts(input: {
  loadedAccounts: ReadonlyArray<IntegrationAccount>;
  setAccounts: Dispatch<SetStateAction<ReadonlyArray<IntegrationAccount>>>;
  setSelectedProject: Dispatch<SetStateAction<ExternalProject | null>>;
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
