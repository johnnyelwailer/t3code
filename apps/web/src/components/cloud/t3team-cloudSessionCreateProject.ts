/**
 * The project a new cloud session is created for, as this computer's server knows it.
 *
 * The desktop's own server dispatches the session and resolves the project from its own checkout
 * (repository and commit to clone, or the folder to start in). A project id from another machine
 * (a cloud session's copy of the same repository) means nothing to it, and a create without a
 * project starts a bare session whose machine never lists a project, so the queued message waits
 * forever. So the composer's project maps to its twin on this computer: the same logical project
 * key the machine list groups by. Pure.
 *
 * @module t3team-cloudSessionCreateProject
 */
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

export interface CloudSessionCreateProject {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

export function resolveCloudSessionCreateProject(input: {
  readonly projectRef: CloudSessionCreateProject | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  /** The composer project's logical key (`useCloudSessionProjectKey`). */
  readonly projectKey: string | null;
  readonly projects: ReadonlyArray<{
    readonly environmentId: string;
    readonly projectId: ProjectId;
    readonly logicalKey: string;
  }>;
}): CloudSessionCreateProject | undefined {
  const { projectRef, primaryEnvironmentId, projectKey } = input;
  if (projectRef === null || primaryEnvironmentId === null) return undefined;
  if (projectRef.environmentId === primaryEnvironmentId) return projectRef;
  if (projectKey === null) return undefined;
  const twin = input.projects.find(
    (project) =>
      project.environmentId === String(primaryEnvironmentId) && project.logicalKey === projectKey,
  );
  return twin === undefined
    ? undefined
    : { environmentId: primaryEnvironmentId, projectId: twin.projectId };
}
