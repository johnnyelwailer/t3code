import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import type { SelectedProjectFacts } from "./t3team-extensionTypes";

/** The facts of the project the picker is for that a slot may act on; null when none is selected. */
export function selectedProjectFacts(
  project: EnvironmentProject | null | undefined,
): SelectedProjectFacts | null {
  return project
    ? {
        id: String(project.id),
        environmentId: String(project.environmentId),
        title: project.title,
        workspaceRoot: project.workspaceRoot,
        repositoryIdentity: project.repositoryIdentity ?? null,
      }
    : null;
}
