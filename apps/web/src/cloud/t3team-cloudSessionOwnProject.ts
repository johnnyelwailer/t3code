/**
 * The project a cloud session's machine was started for: its "own" project. A composer bound to
 * the session runs there, however that copy groups on the machine (a project without a remote is
 * only a folder there; a checkout may lack the repository identity the composer's copy has).
 *
 * The binding is by session, not by git key: a session is picked for one composer project
 * (`CloudSessionTarget.projectKey`, dropped by the project-follow hook once the project changes),
 * and its server registers its working directory as its project on startup
 * (`--auto-bootstrap-project-from-cwd`). So its own project is the one in the session's
 * environment whose workspace root is that server's `cwd`.
 */
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

export interface CloudSessionOwnProject {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

export function resolveCloudSessionOwnProject(input: {
  /** The composer's Run-on target (null when it targets no cloud session). */
  readonly target: { readonly sessionId: string; readonly projectKey: string | null } | null;
  /** The composer project's logical key, as the target recorded it. */
  readonly projectKey: string | null;
  readonly sessions: ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>;
  /** The server working directory an environment reported in its config; null when unknown. */
  readonly serverCwdOf: (environmentId: EnvironmentId) => string | null;
  readonly projects: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly id: ProjectId;
    readonly workspaceRoot: string;
  }>;
}): CloudSessionOwnProject | null {
  const { target } = input;
  // A target set up for another project (or for none) is not this project's session.
  if (target === null || target.projectKey === null || target.projectKey !== input.projectKey) {
    return null;
  }
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
  return own === undefined ? null : { environmentId: own.environmentId, projectId: own.id };
}
