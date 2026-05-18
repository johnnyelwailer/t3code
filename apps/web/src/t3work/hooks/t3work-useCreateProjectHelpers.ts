import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import type { Dispatch, SetStateAction } from "react";
import type { CreateProjectStep } from "./t3work-useCreateProject";
import { pickPreferredAccount } from "./t3work-createProjectUtils";

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
  input.setSelectedAccount(preferredAccount);
  input.setStep("account");
  return preferredAccount;
}
