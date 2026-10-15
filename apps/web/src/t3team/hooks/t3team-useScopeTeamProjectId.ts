import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  resolveScopeHomeProjectId,
  resolveScopeTeamProjectId,
} from "~/t3team/t3team-scopeProjectResolution";
import { useT3TeamSidebarProjectScope } from "~/t3team/t3team-sidebarProjectScopeStore";

/**
 * The Team project the sidebar's project scope names, resolved against the caller's own project
 * store (`useProjectStore` is not a shared singleton, so the sidebar cannot resolve it for us).
 * `null` when the sidebar is on "All projects" or the scope names no known project.
 */
function useT3TeamScopeTeamProjectId(input: {
  readonly allProjects: ReadonlyArray<ProjectShellProject>;
  readonly resolveProjectId: (projectId: string) => string;
}): string | null {
  const scopedProjectId = useT3TeamSidebarProjectScope((state) => state.scopedProjectId);
  const scopedProjectRefs = useT3TeamSidebarProjectScope((state) => state.scopedProjectRefs);
  const { allProjects, resolveProjectId } = input;
  return useMemo(
    () =>
      resolveScopeTeamProjectId({
        scopedProjectId,
        scopedProjectRefs,
        allProjects,
        resolveProjectId,
      }),
    [allProjects, resolveProjectId, scopedProjectId, scopedProjectRefs],
  );
}

/**
 * The project the Team home opens on: the scoped project, nothing under "All projects", and the
 * store's own selection only while a persisted scope has not resolved yet.
 */
export function useT3TeamScopeHomeProjectId(
  input: {
    readonly allProjects: ReadonlyArray<ProjectShellProject>;
    readonly resolveProjectId: (projectId: string) => string;
  },
  storeSelectedProjectId: string | null,
): string | null {
  const scopeTeamProjectId = useT3TeamScopeTeamProjectId(input);
  const scopeKey = useT3TeamSidebarProjectScope((state) => state.scopedProjectKey);
  return resolveScopeHomeProjectId({ scopeTeamProjectId, scopeKey, storeSelectedProjectId });
}
