/**
 * The project a cloud session's machine was started for: its "own" project. A composer bound to
 * the session runs there, however that copy groups on the machine (a project without a remote is
 * only a folder there; a checkout may not carry its repository identity yet).
 *
 * The binding is by session, not by git key: a session is picked for one composer project
 * (`CloudSessionTarget.projectKey`, dropped by the project-follow hook once the project changes),
 * and its server registers its working directory as its project on startup
 * (`--auto-bootstrap-project-from-cwd`). So its own project is the one in the session's
 * environment whose workspace root is that server's `cwd`.
 *
 * A session picked from the list may have been started for another project, so the own project
 * must not contradict the composer's: a different repository, a checkout for a project without a
 * remote, or another project's folder (`plainProjectFolderName`) is not this project.
 */
import {
  type CloudSession,
  EnvironmentId,
  type ProjectId,
  repositoryGroupingKeyOf,
} from "@t3tools/contracts";
import {
  type CloudSessionLocalProject,
  type CloudSessionProjectFacts,
  isSameCloudSessionProject,
  ownProjectOnMachine,
  projectCwdOf,
} from "@t3tools/shared/t3team-cloudSessionFit";

import {
  type MachineProjectBinding,
  resolveMachineOwnProject,
} from "./t3team-cloudSessionMachineProject";

export { projectCwdOf };

export interface CloudSessionOwnProject {
  readonly environmentId: EnvironmentId;
  /** Null while the session's server has not listed its own project yet: the environment is
   * held for it rather than offered through another project that merely groups the same. */
  readonly projectId: ProjectId | null;
  /** Set when the machine's welcome named the project; absent when it was found by folder. */
  readonly resolvedBy?: MachineProjectBinding;
}

type ProjectFacts = CloudSessionProjectFacts;

type ComposerProject = CloudSessionLocalProject;

const repositoryOf = (project: ProjectFacts) =>
  project.repositoryIdentity ? repositoryGroupingKeyOf(project.repositoryIdentity) : null;

/** A Run-on target set up for this project: only then is its machine's working folder this project's. */
export function targetFollowsProject(
  target: { readonly projectKey: string | null } | null,
  project: ComposerProject | null,
  projectKey: string | null,
): boolean {
  return (
    target !== null &&
    project !== null &&
    target.projectKey !== null &&
    target.projectKey === projectKey
  );
}

export function resolveCloudSessionOwnProject(input: {
  /** The composer's Run-on target (null when it targets no cloud session). */
  readonly target: { readonly sessionId: string; readonly projectKey: string | null } | null;
  /** The composer's project and its logical key, as the target recorded it. */
  readonly project: ComposerProject | null;
  readonly projectKey: string | null;
  readonly sessions: ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>;
  /** The working directory an environment registers as its project (`projectCwdOf`); null when none. */
  readonly serverCwdOf: (environmentId: EnvironmentId) => string | null;
  /** The project id the environment's welcome names as its own, when it has reached this app. */
  readonly bootstrapProjectIdOf?: (environmentId: EnvironmentId) => ProjectId | null;
  readonly projects: ReadonlyArray<
    ProjectFacts & { readonly environmentId: EnvironmentId; readonly id: ProjectId }
  >;
}): CloudSessionOwnProject | null {
  const { target, project } = input;
  if (
    target === null ||
    project === null ||
    !targetFollowsProject(target, project, input.projectKey)
  ) {
    return null;
  }
  const environmentId = input.sessions.find(
    (item) => item.sessionId === target.sessionId,
  )?.environmentId;
  if (environmentId === undefined) return null;
  const machineId = EnvironmentId.make(environmentId);
  const machine = resolveMachineOwnProject({
    environmentId: machineId,
    bootstrapProjectId: input.bootstrapProjectIdOf?.(machineId) ?? null,
    cwd: input.serverCwdOf(machineId),
    projects: input.projects,
  });
  if (!machine.named) return null;
  const own = machine.project;
  if (own === undefined) return { environmentId: machineId, projectId: null };
  if (!isSameCloudSessionProject(project, own)) return null;
  return {
    environmentId: own.environmentId,
    projectId: own.id,
    ...(machine.by === "bootstrap-id" ? { resolvedBy: machine.by } : {}),
  };
}

/**
 * One project per environment for the composer's project: the first that groups with it, except
 * that the session's own project takes its environment even when another project there groups the
 * same (a restored checkout of the same repository at another path), so a queued send lands in it.
 * While that project is not listed yet, its environment is offered for nothing at all.
 */
export function logicalProjectPerEnvironment<
  P extends { readonly environmentId: EnvironmentId; readonly id: ProjectId },
>(
  projects: ReadonlyArray<P>,
  groupsWithComposer: (project: P) => boolean,
  own: CloudSessionOwnProject | null,
): Array<{ readonly environmentId: EnvironmentId; readonly projectId: ProjectId }> {
  const picked: Array<{ readonly environmentId: EnvironmentId; readonly projectId: ProjectId }> =
    [];
  const seen = new Set<EnvironmentId>();
  if (own !== null) {
    seen.add(own.environmentId);
    if (own.projectId !== null) {
      picked.push({ environmentId: own.environmentId, projectId: own.projectId });
    }
  }
  for (const project of projects) {
    if (seen.has(project.environmentId) || !groupsWithComposer(project)) continue;
    seen.add(project.environmentId);
    picked.push({ environmentId: project.environmentId, projectId: project.id });
  }
  return picked;
}

export function resolveCloudSessionRestartProjectId(input: {
  readonly environmentId: EnvironmentId | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly serverCwd: string | null;
  readonly projects: ReadonlyArray<ComposerProject & { readonly environmentId: EnvironmentId }>;
}): ProjectId | null {
  if (
    input.environmentId === null ||
    input.primaryEnvironmentId === null ||
    input.serverCwd === null
  )
    return null;
  const own = ownProjectOnMachine(
    input.serverCwd,
    input.projects.filter((project) => project.environmentId === input.environmentId),
  );
  if (own === undefined) return null;
  if (own.environmentId === input.primaryEnvironmentId) return own.id;
  const candidates = input.projects.filter(
    (project) =>
      project.environmentId === input.primaryEnvironmentId &&
      (repositoryOf(project) === null || repositoryOf(own) !== null) &&
      isSameCloudSessionProject(project, own),
  );
  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
}
