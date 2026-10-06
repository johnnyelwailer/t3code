import { useEffect, useRef } from "react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { useT3TeamCreateProjectRequestStore } from "~/t3team/t3team-createProjectRequest";

/**
 * Lands the wizard on a Jira project requested from outside it (a sidebar "add" pill): picks the
 * site account, loads its projects, selects the project by external id. Anything it cannot find
 * (unknown account, project gone from Jira) just drops the request, leaving the normal wizard.
 */
export function useCreateProjectPreselect(input: {
  bootstrapping: boolean;
  loadingProjects: boolean;
  accounts: ReadonlyArray<IntegrationAccount>;
  selectedAccount: IntegrationAccount | null;
  projects: ReadonlyArray<ExternalProject>;
  loadProjects: (account: IntegrationAccount) => Promise<void>;
  onSelectProject: (project: ExternalProject) => void;
}): void {
  const { bootstrapping, loadingProjects, accounts, selectedAccount, projects } = input;
  const { loadProjects, onSelectProject } = input;
  const preselect = useT3TeamCreateProjectRequestStore((state) => state.preselect);
  const consume = useT3TeamCreateProjectRequestStore((state) => state.consumePreselect);
  const loadStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!preselect) {
      // Applied or dropped: a later request for the same project must load afresh.
      loadStartedFor.current = null;
      return;
    }
    if (bootstrapping) return;
    const account = accounts.find((candidate) => candidate.id === preselect.accountId);
    if (!account) {
      consume();
      return;
    }
    const target = `${preselect.accountId}::${preselect.externalProjectId}`;
    const project =
      selectedAccount?.id === account.id
        ? projects.find((candidate) => candidate.id === preselect.externalProjectId)
        : undefined;
    if (project) {
      onSelectProject(project);
      consume();
      return;
    }
    if (loadStartedFor.current !== target) {
      loadStartedFor.current = target;
      void loadProjects(account);
      return;
    }
    // The load ran and finished without the project: nothing more to wait for.
    if (selectedAccount?.id === account.id && !loadingProjects) consume();
  }, [
    accounts,
    bootstrapping,
    consume,
    loadProjects,
    loadingProjects,
    onSelectProject,
    preselect,
    projects,
    selectedAccount,
  ]);
}
