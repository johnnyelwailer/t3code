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
  type EnvironmentId,
  plainProjectFolderName,
  type ProjectId,
  type RepositoryIdentity,
  repositoryGroupingKeyOf,
} from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

export interface CloudSessionOwnProject {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

interface ProjectFacts {
  readonly workspaceRoot: string;
  readonly repositoryIdentity?: RepositoryIdentity | null | undefined;
}

const repositoryOf = (project: ProjectFacts) =>
  project.repositoryIdentity ? repositoryGroupingKeyOf(project.repositoryIdentity) : null;

const folderOf = (workspaceRoot: string) =>
  normalizeProjectPathForComparison(workspaceRoot).split(/[\\/]/).pop() ?? "";

/** Whether the machine's project can be the one this composer project's session was started for. */
function isSameProject(composer: ProjectFacts & { readonly title: string }, own: ProjectFacts) {
  const composerRepository = repositoryOf(composer);
  const ownRepository = repositoryOf(own);
  if (composerRepository === null) {
    return (
      ownRepository === null &&
      folderOf(own.workspaceRoot) === plainProjectFolderName(composer.title)
    );
  }
  // The checkout may not have its identity yet; a different repository is never this project.
  return ownRepository === null || ownRepository === composerRepository;
}

export function resolveCloudSessionOwnProject(input: {
  /** The composer's Run-on target (null when it targets no cloud session). */
  readonly target: { readonly sessionId: string; readonly projectKey: string | null } | null;
  /** The composer's project and its logical key, as the target recorded it. */
  readonly project: (ProjectFacts & { readonly title: string }) | null;
  readonly projectKey: string | null;
  readonly sessions: ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>;
  /** The server working directory an environment reported in its config; null when unknown. */
  readonly serverCwdOf: (environmentId: EnvironmentId) => string | null;
  readonly projects: ReadonlyArray<
    ProjectFacts & { readonly environmentId: EnvironmentId; readonly id: ProjectId }
  >;
}): CloudSessionOwnProject | null {
  const { target, project } = input;
  // A target set up for another project (or for none) is not this project's session.
  if (target === null || project === null || target.projectKey === null) return null;
  if (target.projectKey !== input.projectKey) return null;
  const environmentId = input.sessions.find(
    (item) => item.sessionId === target.sessionId,
  )?.environmentId;
  if (environmentId === undefined) return null;
  const cwd = input.serverCwdOf(environmentId as EnvironmentId);
  if (cwd === null) return null;
  const root = normalizeProjectPathForComparison(cwd);
  const own = input.projects.find(
    (item) =>
      String(item.environmentId) === environmentId &&
      normalizeProjectPathForComparison(item.workspaceRoot) === root,
  );
  if (own === undefined || !isSameProject(project, own)) return null;
  return { environmentId: own.environmentId, projectId: own.id };
}
