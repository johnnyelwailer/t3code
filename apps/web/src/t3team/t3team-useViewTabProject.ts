import { createContext, useContext } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useMyWorkBoundProjects } from "~/t3team/t3team-myWorkBoundProjects";

export type ViewTabProject =
  | { readonly status: "loading" }
  | { readonly status: "unknown" }
  | { readonly status: "ready"; readonly project: ProjectShellProject };

const LOADING: ViewTabProject = { status: "loading" };
const UNKNOWN: ViewTabProject = { status: "unknown" };

export function resolveViewTabProject(
  projects: ReadonlyArray<ProjectShellProject> | null,
  projectId: string,
): ViewTabProject {
  if (projects === null) return LOADING;
  const project = projects.find((candidate) => candidate.id === projectId);
  return project ? { status: "ready", project } : UNKNOWN;
}

/** Stories and tests hand the tab a fixed project list; the app reads the page's own. */
const ViewTabProjectsContext = createContext<ReadonlyArray<ProjectShellProject> | null>(null);

export const ViewTabProjectsProvider = ViewTabProjectsContext.Provider;

/**
 * The work-source project a view tab shows, from the page's shared project list (the one My Work
 * scopes its digest to), so a tab costs no store of its own and agrees with the dashboard.
 */
export function useViewTabProject(projectId: string): ViewTabProject {
  const fixedProjects = useContext(ViewTabProjectsContext);
  const boundProjects = useMyWorkBoundProjects();
  return resolveViewTabProject(fixedProjects ?? boundProjects, projectId);
}
