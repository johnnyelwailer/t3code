import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjects } from "~/state/entities";
import type { Project } from "~/types";
import { resolveCanonicalProjectId } from "./t3team-threadProjectResolution";

/**
 * The live (environment) project a Team project is backed by: the one with the same id, else the
 * one that owns the same workspace root. This is the record the sidebar's scope pills draw their
 * icon from, so a surface that needs "the project's icon" must go through it.
 */
export function findLiveProjectForShellProject(
  project: ProjectShellProject,
  liveProjects: ReadonlyArray<Project>,
): Project | null {
  const sameId = liveProjects.find((candidate) => String(candidate.id) === String(project.id));
  if (sameId) return sameId;
  const canonicalId = resolveCanonicalProjectId(project, liveProjects);
  return canonicalId === null
    ? null
    : (liveProjects.find((candidate) => candidate.id === canonicalId) ?? null);
}

export function useLiveProjectForShellProject(project: ProjectShellProject) {
  const liveProjects = useProjects();
  return useMemo(
    () => findLiveProjectForShellProject(project, liveProjects),
    [project, liveProjects],
  );
}
