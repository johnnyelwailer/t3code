import type { ProjectShellProject } from "@t3tools/project-context";

/**
 * The project the "Manage linked repositories" dialog edits. It resolves from `allProjects`, the
 * same list the dashboard resolves from: a loose (live-only) workspace project is not in the
 * stored `projects`, and looking there made the menu item open nothing for it.
 */
export function resolveManageRepositoriesProject(
  store: { readonly allProjects: ReadonlyArray<ProjectShellProject> },
  projectId: string | null,
): ProjectShellProject | null {
  if (!projectId) return null;
  return store.allProjects.find((candidate) => candidate.id === projectId) ?? null;
}
