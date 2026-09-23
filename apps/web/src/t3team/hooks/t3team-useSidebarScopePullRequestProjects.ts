import { useMemo } from "react";

import { usePrimarySettings } from "~/hooks/useSettings";
import { useProjects } from "~/state/entities";
import { useT3TeamSidebarProjectScope } from "~/t3team/t3team-sidebarProjectScopeStore";

import {
  resolveSidebarScopePullRequestProjects,
  type SidebarScopePullRequestSelection,
} from "./t3team-sidebarScopePullRequestProjects.logic";

/**
 * The sidebar's project scope as the pull request list should read it, or `null` when the list
 * is unscoped: the pills flag is off, or the sidebar is on "All projects".
 */
export function useT3TeamSidebarScopePullRequestProjects(): SidebarScopePullRequestSelection | null {
  const enabled = usePrimarySettings((settings) => settings.t3teamProjectScopePillsEnabled);
  const scopedProjectRefs = useT3TeamSidebarProjectScope((state) => state.scopedProjectRefs);
  const linkedRepositoryKeysByProjectId = useT3TeamSidebarProjectScope(
    (state) => state.linkedRepositoryKeysByProjectId,
  );
  const projects = useProjects();
  return useMemo(
    () =>
      enabled && scopedProjectRefs !== null
        ? resolveSidebarScopePullRequestProjects({
            scopedProjectRefs,
            projects,
            linkedRepositoryKeysByProjectId,
          })
        : null,
    [enabled, linkedRepositoryKeysByProjectId, projects, scopedProjectRefs],
  );
}
