import type { Dispatch, SetStateAction } from "react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import { persistLastAccountId } from "./t3team-createProjectUtils";
import { readIntegrationCache, writeIntegrationCache } from "./t3team-integrationCache";
import type { CreateProjectStep } from "./t3team-useCreateProject";
import { advanceStepForward } from "./t3team-useCreateProjectHelpers";

type FailFn = (value: unknown, fallback: string, nextStep?: CreateProjectStep) => void;

export async function loadProjectsForAccount(input: {
  backend: BackendApi | null;
  account: IntegrationAccount;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoadingProjects: Dispatch<SetStateAction<boolean>>;
  setSelectedAccount: Dispatch<SetStateAction<IntegrationAccount | null>>;
  setSelectedProject: (project: ExternalProject | null) => void;
  setProjects: Dispatch<SetStateAction<ReadonlyArray<ExternalProject>>>;
  setStep: Dispatch<SetStateAction<CreateProjectStep>>;
  fail: FailFn;
}): Promise<void> {
  const { account } = input;
  input.setError(null);
  input.setLoadingProjects(true);

  const cacheKey = `atlassian:listProjects:${account.provider}:${account.id}`;
  const cachedProjects =
    readIntegrationCache<ReadonlyArray<ExternalProject>>(cacheKey)?.value ?? [];
  if (cachedProjects.length > 0) {
    runT3TeamViewTransition(
      () => {
        input.setSelectedAccount(account);
        persistLastAccountId(account.id);
        input.setSelectedProject(null);
        input.setProjects(cachedProjects);
        input.setStep("project");
      },
      { types: ["t3team-wizard-forward"] },
    );
  }

  try {
    if (!input.backend) throw new Error("Backend not available");
    input.setSelectedAccount(account);
    persistLastAccountId(account.id);
    input.setSelectedProject(null);
    const loadedProjects = await input.backend.atlassian.listProjects({
      id: account.id,
      provider: account.provider,
    });
    writeIntegrationCache(cacheKey, loadedProjects);
    // No view transition here: by the time this network response lands the step has usually
    // already moved to "project" via the cached-list branch above, so this is a background
    // data refresh, not a step change — animating it would repaint mid-interaction and steal
    // clicks (the wizard-binding bug). `advanceStepForward` also guards the rare case where
    // there was no cache: it still moves the step forward, just without an animated repaint.
    input.setProjects(loadedProjects);
    advanceStepForward(input.setStep, "project");
  } catch (error) {
    input.fail(error, "Failed to load Jira projects", "account");
  } finally {
    input.setLoadingProjects(false);
  }
}
