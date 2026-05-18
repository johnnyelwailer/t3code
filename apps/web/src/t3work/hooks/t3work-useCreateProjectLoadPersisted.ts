import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import type { Dispatch, SetStateAction } from "react";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { CreateProjectStep } from "./t3work-useCreateProject";
import { persistLastAccountId, pickPreferredAccount } from "./t3work-createProjectUtils";

type FailFn = (value: unknown, fallback: string, nextStep?: CreateProjectStep) => void;

export async function loadPersistedAccountsStep(input: {
  backend: BackendApi | null;
  setAccounts: Dispatch<SetStateAction<ReadonlyArray<IntegrationAccount>>>;
  setSelectedAccount: Dispatch<SetStateAction<IntegrationAccount | null>>;
  setSelectedProject: Dispatch<SetStateAction<ExternalProject | null>>;
  setProjects: Dispatch<SetStateAction<ReadonlyArray<ExternalProject>>>;
  setStep: Dispatch<SetStateAction<CreateProjectStep>>;
  setBootstrapping: Dispatch<SetStateAction<boolean>>;
  setLoadingAccounts: Dispatch<SetStateAction<boolean>>;
  setLoadingProjects: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  fail: FailFn;
}): Promise<void> {
  input.setError(null);
  input.setLoadingAccounts(true);
  input.setBootstrapping(true);
  try {
    if (!input.backend) throw new Error("Backend not available");
    const loadedAccounts = await input.backend.atlassian.listAccounts();
    if (loadedAccounts.length === 0) return;

    input.setAccounts(loadedAccounts);
    const preferredAccount = pickPreferredAccount(loadedAccounts);
    input.setSelectedAccount(preferredAccount);
    if (preferredAccount) persistLastAccountId(preferredAccount.id);

    if (loadedAccounts.length === 1 && preferredAccount) {
      input.setLoadingProjects(true);
      const projects = await input.backend.atlassian.listProjects({
        id: preferredAccount.id,
        provider: preferredAccount.provider,
      });
      input.setSelectedProject(null);
      input.setProjects(projects);
      input.setStep("project");
      return;
    }

    input.setProjects([]);
    input.setStep("account");
  } catch (error) {
    input.fail(error, "Failed to load saved Atlassian settings");
  } finally {
    input.setBootstrapping(false);
    input.setLoadingAccounts(false);
    input.setLoadingProjects(false);
  }
}
