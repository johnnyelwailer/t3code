import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import type { Dispatch, SetStateAction } from "react";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import type { CreateProjectStep } from "./t3team-useCreateProject";
import { persistLastAccountId, pickPreferredAccount } from "./t3team-createProjectUtils";
import { readIntegrationCache, writeIntegrationCache } from "./t3team-integrationCache";
import { advanceStepForward } from "./t3team-useCreateProjectHelpers";

type FailFn = (value: unknown, fallback: string, nextStep?: CreateProjectStep) => void;

export async function loadPersistedAccountsStep(input: {
  backend: BackendApi | null;
  setAccounts: Dispatch<SetStateAction<ReadonlyArray<IntegrationAccount>>>;
  setSelectedAccount: Dispatch<SetStateAction<IntegrationAccount | null>>;
  setSelectedProject: (project: ExternalProject | null) => void;
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

  const cachedAccounts =
    readIntegrationCache<ReadonlyArray<IntegrationAccount>>("atlassian:listAccounts")?.value ?? [];
  if (cachedAccounts.length > 0) {
    const cachedPreferredAccount = pickPreferredAccount(cachedAccounts);
    if (cachedPreferredAccount) {
      persistLastAccountId(cachedPreferredAccount.id);
      const cachedProjects =
        readIntegrationCache<ReadonlyArray<ExternalProject>>(
          `atlassian:listProjects:${cachedPreferredAccount.provider}:${cachedPreferredAccount.id}`,
        )?.value ?? [];
      runT3TeamViewTransition(
        () => {
          input.setAccounts(cachedAccounts);
          input.setSelectedAccount(cachedPreferredAccount);
          input.setSelectedProject(null);
          input.setProjects(cachedProjects);
          input.setStep(cachedAccounts.length === 1 ? "project" : "account");
        },
        { types: ["t3team-wizard-forward"] },
      );
    } else {
      input.setAccounts(cachedAccounts);
    }
  }

  try {
    if (!input.backend) throw new Error("Backend not available");
    const loadedAccounts = await input.backend.atlassian.listAccounts();
    writeIntegrationCache("atlassian:listAccounts", loadedAccounts);
    if (loadedAccounts.length === 0) return;

    const preferredAccount = pickPreferredAccount(loadedAccounts);
    if (preferredAccount) persistLastAccountId(preferredAccount.id);

    if (loadedAccounts.length === 1 && preferredAccount) {
      input.setLoadingProjects(true);
      const projects = await input.backend.atlassian.listProjects({
        id: preferredAccount.id,
        provider: preferredAccount.provider,
      });
      writeIntegrationCache(
        `atlassian:listProjects:${preferredAccount.provider}:${preferredAccount.id}`,
        projects,
      );
      // No unconditional `setSelectedProject(null)` here: a late bootstrap resolution must
      // never clear a selection the user already made while the cached list was showing.
      // `advanceStepForward` also refuses to move the step backwards out of "profile"/
      // "repositories"/"review"/"creating" if the user finished picking before this network
      // call landed.
      runT3TeamViewTransition(
        () => {
          input.setAccounts(loadedAccounts);
          input.setSelectedAccount(preferredAccount);
          input.setProjects(projects);
          advanceStepForward(input.setStep, "project");
        },
        { types: ["t3team-wizard-forward"] },
      );
      return;
    }

    // Clearing the project list is gated the same way: it must only happen when the step
    // is genuinely still advancing to "account", never as a side effect of a late promise
    // landing after the user has moved on with the (correct) cached list.
    runT3TeamViewTransition(
      () => {
        input.setAccounts(loadedAccounts);
        input.setSelectedAccount(preferredAccount);
        advanceStepForward(input.setStep, "account", () => input.setProjects([]));
      },
      { types: ["t3team-wizard-forward"] },
    );
  } catch (error) {
    input.fail(error, "Failed to load saved Atlassian settings");
  } finally {
    input.setBootstrapping(false);
    input.setLoadingAccounts(false);
    input.setLoadingProjects(false);
  }
}
