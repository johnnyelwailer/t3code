/**
 * The Team project a chat composer discovers recipes for: a stored Team project, or the loose
 * workspace project the project store synthesizes for a plain workspace with no Team project.
 */
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  deriveLooseWorkspaceProjects,
  reconcileStoredProjectsWithLive,
} from "~/t3team/hooks/t3team-projectStoreUtils";
import { findLiveProjectForShellProject } from "~/t3team/hooks/t3team-useLiveProjectForShellProject";
import type { Project } from "~/types";

/** `null` until the stored projects hydrate, so a loose stand-in never races a stored project. */
export function resolveComposerRecipeProject(input: {
  readonly projectId: string | null;
  readonly storedProjects: ReadonlyArray<ProjectShellProject> | null;
  readonly liveProjects: ReadonlyArray<Project>;
}): ProjectShellProject | null {
  const { projectId, storedProjects, liveProjects } = input;
  if (projectId === null || storedProjects === null) return null;
  const candidates = [
    ...reconcileStoredProjectsWithLive(storedProjects, liveProjects),
    ...deriveLooseWorkspaceProjects(storedProjects, liveProjects),
  ];
  return (
    candidates.find(
      (candidate) => findLiveProjectForShellProject(candidate, liveProjects)?.id === projectId,
    ) ?? null
  );
}
