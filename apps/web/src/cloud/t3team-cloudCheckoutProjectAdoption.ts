import { type EnvironmentId, repositoryGroupingKeyOf } from "@t3tools/contracts";
import { deriveLogicalProjectKeyFromSettings } from "@t3tools/client-runtime/state/project-grouping";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

/**
 * A cloud session's server registers its checkout directory as its project, so the project it
 * lists is named after a runner folder ("repository") and carries no work-source binding. The
 * sidebar groups by repository identity, but a project bound to a work source (Jira, ...) groups
 * by that binding instead and never merges with an unbound project through its repository, and a
 * plain local project's group is labelled by the repository when the two titles differ. Either way
 * the user's own project and the session's checkout showed as two rows, or as one with the wrong
 * name.
 *
 * The checkout adopts the title (and the work-source binding, when the user's own project has one)
 * of the primary environment's project for the same repository, so both group as that one project
 * and the user's own project supplies the name and icon. Only the grouping view changes: the
 * returned project keeps its own environment and id, so selecting it still opens the session's.
 */
const REPOSITORY_MODE = {
  sidebarProjectGroupingMode: "repository",
  sidebarProjectGroupingOverrides: {},
} as const;

const repositoryOf = (project: EnvironmentProject) =>
  project.repositoryIdentity
    ? repositoryGroupingKeyOf(project.repositoryIdentity).toLowerCase()
    : null;

const freshest = (projects: ReadonlyArray<EnvironmentProject>) =>
  projects.reduce((current, candidate) =>
    Date.parse(candidate.updatedAt) > Date.parse(current.updatedAt) ? candidate : current,
  );

/**
 * The project of the primary environment a checkout belongs to: the freshest plain one of its
 * repository, else the bound ones when they are all one work source. Null when none, or when
 * bound projects of different work sources share the repository (which to join is not knowable).
 */
function ownProjectOfCheckout(
  checkout: EnvironmentProject,
  primary: ReadonlyArray<EnvironmentProject>,
): EnvironmentProject | null {
  const repository = repositoryOf(checkout);
  if (repository === null) return null;
  const sameRepository = primary.filter((project) => repositoryOf(project) === repository);
  const plain = sameRepository.filter(
    (project) => deriveLogicalProjectKeyFromSettings(project, REPOSITORY_MODE) === repository,
  );
  if (plain.length > 0) return freshest(plain);
  const bound = sameRepository.filter((project) => project.source !== undefined);
  const sources = new Set(
    bound.map((project) => deriveLogicalProjectKeyFromSettings(project, REPOSITORY_MODE)),
  );
  return sources.size === 1 ? freshest(bound) : null;
}

export function adoptCloudCheckoutProjects(input: {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly isCloudSessionEnvironment: (environmentId: EnvironmentId) => boolean;
}): ReadonlyArray<EnvironmentProject> {
  const { primaryEnvironmentId } = input;
  if (primaryEnvironmentId === null) return input.projects;
  const primary = input.projects.filter(
    (project) => project.environmentId === primaryEnvironmentId && project.isScratch !== true,
  );
  let changed = false;
  const adopted = input.projects.map((project) => {
    if (
      project.environmentId === primaryEnvironmentId ||
      project.isScratch === true ||
      !input.isCloudSessionEnvironment(project.environmentId)
    ) {
      return project;
    }
    const own = ownProjectOfCheckout(project, primary);
    if (own === null) return project;
    const view = {
      ...project,
      title: own.title,
      ...(own.source !== undefined ? { source: own.source } : {}),
    };
    if (view.title === project.title && view.source === project.source) return project;
    changed = true;
    return view;
  });
  return changed ? adopted : input.projects;
}
