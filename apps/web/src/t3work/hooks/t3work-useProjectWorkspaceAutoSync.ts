import { useEffect, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3work/backend/t3work-index";
import {
  readLinkedRepositoryUrlsFromProject,
  readProjectSetupProfileIdFromProject,
} from "~/t3work/hooks/t3work-createProjectBootstrap";
import type { ProjectVisibleWorkspaceContext } from "~/t3work/t3work-projectContextBundle";
import {
  retainProjectWorkspaceSync,
  syncProjectWorkspaceContext,
} from "~/t3work/t3work-projectWorkspaceSync";
import type { ProjectThread, ProjectTicket } from "~/t3work/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

export function useProjectWorkspaceAutoSync(input: {
  project?: ProjectShellProject | null;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  projectThreads?: ReadonlyArray<ProjectThread>;
  githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
  uiState?: unknown;
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  enabled?: boolean;
}): void {
  const backend = useBackend();
  const linkedRepositoryUrls = useMemo(
    () => (input.project ? readLinkedRepositoryUrlsFromProject(input.project) : []),
    [input.project],
  );
  const setupProfileId = useMemo(
    () => (input.project ? readProjectSetupProfileIdFromProject(input.project) : undefined),
    [input.project],
  );

  useEffect(() => {
    if (!input.project) {
      return;
    }
    const workspaceRoot = input.project.workspace?.rootPath;
    if (!backend || input.enabled === false || !workspaceRoot || !setupProfileId) {
      return;
    }
    const releaseSync = retainProjectWorkspaceSync(workspaceRoot);
    const visibleContext: ProjectVisibleWorkspaceContext = {
      ...(input.projectThreads ? { projectThreads: input.projectThreads } : {}),
      ...(input.githubActivityItems ? { githubActivityItems: input.githubActivityItems } : {}),
      ...(input.uiState !== undefined ? { uiState: input.uiState } : {}),
      ...(input.jiraLastCheckedAt !== undefined
        ? { jiraLastCheckedAt: input.jiraLastCheckedAt }
        : {}),
      ...(input.githubLastCheckedAt !== undefined
        ? { githubLastCheckedAt: input.githubLastCheckedAt }
        : {}),
    };
    void syncProjectWorkspaceContext({
      backend,
      project: input.project,
      linkedRepositoryUrls,
      ...(input.projectTickets ? { projectTickets: input.projectTickets } : {}),
      visibleContext,
      setupProfileId,
    }).catch(() => {
      // The queue keeps retrying while this workspace stays mounted; surface the first failure.
      console.warn("Failed to sync t3work project workspace context.");
    });
    return releaseSync;
  }, [
    backend,
    input.enabled,
    input.githubActivityItems,
    input.githubLastCheckedAt,
    input.jiraLastCheckedAt,
    input.project,
    input.projectTickets,
    input.projectThreads,
    input.uiState,
    linkedRepositoryUrls,
    setupProfileId,
  ]);
}
