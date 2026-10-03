import type { OrchestrationProject, ProjectMainRepository } from "@t3tools/contracts";

/** Applies a `project.meta-updated` main-repository field to an in-memory project: absent leaves
 * it unchanged, `null` clears it, a value replaces it. */
export function applyProjectMainRepositoryUpdate(
  project: OrchestrationProject,
  update: ProjectMainRepository | null | undefined,
): OrchestrationProject {
  if (update === undefined) return project;
  if (update === null) {
    const { mainRepository: _cleared, ...rest } = project;
    return rest;
  }
  return { ...project, mainRepository: update };
}
