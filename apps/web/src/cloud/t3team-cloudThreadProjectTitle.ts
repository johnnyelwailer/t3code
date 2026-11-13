import {
  type EnvironmentId,
  type ProjectId,
  type RepositoryIdentity,
  repositoryGroupingKeyOf,
} from "@t3tools/contracts";
import { isSameCloudSessionProject } from "@t3tools/shared/t3team-cloudSessionFit";

interface TitledProject {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly repositoryIdentity?: RepositoryIdentity | null | undefined;
  readonly isScratch?: true | undefined;
}

const repositoryOf = (project: TitledProject) =>
  project.repositoryIdentity ? repositoryGroupingKeyOf(project.repositoryIdentity) : null;

const ownMatchesOf = <T extends TitledProject>(input: {
  readonly project: T;
  readonly isCloudSession: boolean;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<T>;
}): T[] => {
  const { project, primaryEnvironmentId } = input;
  if (!input.isCloudSession || primaryEnvironmentId === null) return [];
  if (project.environmentId === primaryEnvironmentId) return [];
  const repository = repositoryOf(project);
  return input.projects.filter(
    (candidate) =>
      candidate.environmentId === primaryEnvironmentId &&
      candidate.isScratch !== true &&
      repositoryOf(candidate) === repository &&
      isSameCloudSessionProject(candidate, project),
  );
};

/**
 * The user's own project a cloud-session checkout belongs to. The session's server registers its
 * checkout directory as its project (`--auto-bootstrap-project-from-cwd`), so that copy has its
 * own id and is often named after a runner folder. The user's own copy is the primary
 * environment's project it fits (`isSameCloudSessionProject`: the same repository, or for a
 * project without a remote its own folder name).
 *
 * Null when the project's own identity should stand: not a cloud session, already the primary
 * environment's, or no unambiguous local match (none, or several with different titles).
 */
function resolveCloudThreadProjectMatch<T extends TitledProject>(input: {
  readonly project: T;
  readonly isCloudSession: boolean;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<T>;
}): T | null {
  const matches = ownMatchesOf(input);
  const titles = new Set(matches.map((candidate) => candidate.title.trim()));
  titles.delete("");
  if (titles.size !== 1) return null;
  return matches[0] ?? null;
}

/**
 * The title a cloud-session thread shows for its project. Null when the project's own title
 * should stand: not a cloud session, already the primary environment's, or no unambiguous local
 * title for it.
 */
export function resolveCloudThreadProjectTitle(input: {
  readonly project: TitledProject;
  readonly isCloudSession: boolean;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<TitledProject>;
}): string | null {
  const match = resolveCloudThreadProjectMatch(input);
  const title = match?.title.trim();
  return title ? title : null;
}

/** The selected project's identity a cloud-session thread should show: title, pill and icon. */
export function resolveCloudThreadProjectIdentity<T extends TitledProject>(input: {
  readonly project: T;
  readonly isCloudSession: boolean;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<T>;
}): { readonly title: string; readonly iconProject: T } {
  const match = resolveCloudThreadProjectMatch(input);
  return {
    title: match?.title.trim() || input.project.title,
    iconProject: match ?? input.project,
  };
}
