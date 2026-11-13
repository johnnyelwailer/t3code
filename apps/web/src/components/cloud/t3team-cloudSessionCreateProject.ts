/**
 * The project a new cloud session is created for, as this computer's server knows it: a project id
 * from another machine means nothing to the server that dispatches the session, so the composer's
 * project maps to its twin here by the logical key the machine list groups by. Pure.
 *
 * @module t3team-cloudSessionCreateProject
 */
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

export interface CloudSessionCreateProject {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

/**
 * `elsewhere` is the project that exists only on other (cloud) machines: a create here would start
 * a bare session whose machine never lists a project, and whose queued message then waits forever.
 */
export type CloudSessionCreateProjectOutcome =
  | { readonly kind: "project"; readonly project: CloudSessionCreateProject }
  | { readonly kind: "none" }
  | { readonly kind: "elsewhere"; readonly projectRef: CloudSessionCreateProject };

export function resolveCloudSessionCreateProjectOutcome(input: {
  readonly projectRef: CloudSessionCreateProject | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  /** The composer project's logical key (`useCloudSessionProjectKey`). */
  readonly projectKey: string | null;
  readonly projects: ReadonlyArray<{
    readonly environmentId: string;
    readonly projectId: ProjectId;
    readonly logicalKey: string;
  }>;
}): CloudSessionCreateProjectOutcome {
  const { projectRef, primaryEnvironmentId, projectKey } = input;
  if (projectRef === null || primaryEnvironmentId === null) return { kind: "none" };
  if (projectRef.environmentId === primaryEnvironmentId) {
    return { kind: "project", project: projectRef };
  }
  // Without a logical key the two copies cannot be matched at all, so neither a project nor a
  // claim that this computer lacks one would be honest.
  if (projectKey === null) return { kind: "none" };
  const twin = input.projects.find(
    (project) =>
      project.environmentId === String(primaryEnvironmentId) && project.logicalKey === projectKey,
  );
  return twin === undefined
    ? { kind: "elsewhere", projectRef }
    : {
        kind: "project",
        project: { environmentId: primaryEnvironmentId, projectId: twin.projectId },
      };
}

export function resolveCloudSessionCreateProject(
  input: Parameters<typeof resolveCloudSessionCreateProjectOutcome>[0],
): CloudSessionCreateProject | undefined {
  const outcome = resolveCloudSessionCreateProjectOutcome(input);
  return outcome.kind === "project" ? outcome.project : undefined;
}
