/**
 * Persists a user's main-repository choice on its own, without saving the linked-repository
 * list. The chosen checkout is synced if needed, then switched with `selection: "user"`.
 * Used by the one-click Make main path (and by an auto-promote that can persist immediately).
 */
import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  applyWorkspaceBootstrapToProject,
  readLinkedRepositoryUrlsFromProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  beginMainPersist,
  completeMainPersist,
  failMainPersist,
  initialMainOptimisticState,
  isMainPersistPending,
  retryMainPersistUrl,
  setMainLocally,
  type MainRepositoryOptimisticState,
} from "~/t3team/hooks/t3team-mainRepositoryOptimistic";
import { applyMainRepositorySwitchToProject } from "~/t3team/hooks/t3team-projectMainRepository";
import { waitForLinkedRepositoryReady } from "~/t3team/hooks/t3team-waitForLinkedRepositoryReady";

export async function persistProjectMainRepository(input: {
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  readonly url: string | null;
}): Promise<ProjectShellProject> {
  const { backend, url } = input;
  let project = input.project;
  const workspaceRoot = project.workspace?.rootPath;
  if (!workspaceRoot) {
    throw new Error("Project is missing a workspace root.");
  }
  if (url !== null) {
    await backend.projectWorkspace.syncLinkedRepository({ workspaceRoot, url });
    await waitForLinkedRepositoryReady({ backend, workspaceRoot, url });
  }
  const result = await backend.projectWorkspace.setMainRepository({
    projectId: project.id,
    url,
    selection: "user",
  });
  if (!result.changed) return project;
  project = applyMainRepositorySwitchToProject(project, result);
  const linkedRepositoryUrls = readLinkedRepositoryUrlsFromProject(project);
  const rooted = await backend.projectWorkspace.bootstrapWorkspace({
    workspaceRoot: result.workspaceRoot,
    linkedRepositoryUrls,
  });
  return applyWorkspaceBootstrapToProject(project, rooted);
}

export function usePersistMainRepository(input: {
  readonly project: ProjectShellProject;
  readonly initialMainUrl: string | null;
  readonly onProjectUpdated: (project: ProjectShellProject) => void;
}): {
  readonly state: MainRepositoryOptimisticState;
  readonly persist: (nextUrl: string | null, revertOnFailure?: boolean) => Promise<void>;
  readonly setLocal: (nextUrl: string | null) => void;
  readonly retry: () => void;
} {
  const backend = useBackend();
  const [state, setState] = useState(() => initialMainOptimisticState(input.initialMainUrl));

  const persist = async (nextUrl: string | null, revertOnFailure = true) => {
    if (isMainPersistPending(state)) return;
    setState((current) => beginMainPersist(current, nextUrl, revertOnFailure));
    if (!backend) {
      setState((current) => failMainPersist(current));
      return;
    }
    try {
      const next = await persistProjectMainRepository({
        backend,
        project: input.project,
        url: nextUrl,
      });
      input.onProjectUpdated(next);
      setState((current) => completeMainPersist(current, nextUrl));
    } catch {
      setState((current) => failMainPersist(current));
    }
  };

  const setLocal = (nextUrl: string | null) => {
    setState((current) => setMainLocally(current, nextUrl));
  };

  const retry = () => {
    const url = retryMainPersistUrl(state);
    if (url === undefined) return;
    void persist(url, state.revertOnFailure);
  };

  return { state, persist, setLocal, retry };
}
