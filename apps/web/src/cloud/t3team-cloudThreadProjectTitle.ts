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

/**
 * The title a cloud-session thread shows for its project. The session's server registers its
 * checkout directory as its project (`--auto-bootstrap-project-from-cwd`), so the project in that
 * environment is named after a runner folder ("repository"), not after the project the user chose.
 * The user's own copy is the primary environment's project it fits (`isSameCloudSessionProject`:
 * the same repository, or for a project without a remote its own folder name): its title wins.
 *
 * Null when the project's own title should stand: not a cloud session, already the primary
 * environment's, or no unambiguous local title for it.
 */
export function resolveCloudThreadProjectTitle(input: {
  readonly project: TitledProject;
  readonly isCloudSession: boolean;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<TitledProject>;
}): string | null {
  const { project, primaryEnvironmentId } = input;
  if (!input.isCloudSession || primaryEnvironmentId === null) return null;
  if (project.environmentId === primaryEnvironmentId) return null;
  const repository = repositoryOf(project);
  const titles = new Set(
    input.projects
      .filter(
        (candidate) =>
          candidate.environmentId === primaryEnvironmentId &&
          candidate.isScratch !== true &&
          repositoryOf(candidate) === repository &&
          isSameCloudSessionProject(candidate, project),
      )
      .map((candidate) => candidate.title.trim()),
  );
  titles.delete("");
  const [only] = titles;
  return titles.size === 1 && only !== undefined ? only : null;
}
