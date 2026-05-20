import { useEffect, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3work/backend/t3work-index";
import {
  readLinkedRepositoryUrlsFromProject,
  readProjectSetupProfileIdFromProject,
} from "~/t3work/hooks/t3work-createProjectBootstrap";
import { syncProjectWorkspaceContext } from "~/t3work/t3work-projectWorkspaceSync";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function useProjectWorkspaceAutoSync(input: {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  enabled?: boolean;
}): void {
  const backend = useBackend();
  const linkedRepositoryUrls = useMemo(
    () => readLinkedRepositoryUrlsFromProject(input.project),
    [input.project],
  );
  const setupProfileId = useMemo(
    () => readProjectSetupProfileIdFromProject(input.project),
    [input.project],
  );

  useEffect(() => {
    if (!backend || input.enabled === false || !input.project.workspace?.rootPath) {
      return;
    }
    void syncProjectWorkspaceContext({
      backend,
      project: input.project,
      linkedRepositoryUrls,
      projectTickets: input.projectTickets,
      setupProfileId,
    }).catch(() => {
      // A later mount or thread bootstrap can retry if the sync fails.
    });
  }, [
    backend,
    input.enabled,
    input.project,
    input.projectTickets,
    linkedRepositoryUrls,
    setupProfileId,
  ]);
}
