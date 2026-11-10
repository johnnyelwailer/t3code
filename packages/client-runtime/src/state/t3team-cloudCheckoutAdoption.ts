/**
 * A cloud checkout shows the user's project title, icon and favicon, and keeps its own environment and id.
 */
import { type EnvironmentId, repositoryGroupingKeyOf } from "@t3tools/contracts";

import { deriveLogicalProjectKeyFromSettings } from "./projectGrouping.ts";
import type { EnvironmentProject } from "./models.ts";

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
 * The own-environment project a checkout belongs to: the freshest plain one of its repository,
 * else the bound ones when they are all one work source. Null when none, or when bound projects
 * of different work sources share the repository (which to join is not knowable).
 */
function ownProjectOfCheckout(
  checkout: EnvironmentProject,
  own: ReadonlyArray<EnvironmentProject>,
): EnvironmentProject | null {
  const repository = repositoryOf(checkout);
  if (repository === null) return null;
  const sameRepository = own.filter((project) => repositoryOf(project) === repository);
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
  readonly isOwnEnvironment: (environmentId: EnvironmentId) => boolean;
  readonly isCloudSessionEnvironment: (environmentId: EnvironmentId) => boolean;
}): ReadonlyArray<EnvironmentProject> {
  const own = input.projects.filter(
    (project) => project.isScratch !== true && input.isOwnEnvironment(project.environmentId),
  );
  let changed = false;
  const adopted = input.projects.map((project) => {
    if (project.isScratch === true || !input.isCloudSessionEnvironment(project.environmentId)) {
      return project;
    }
    const match = ownProjectOfCheckout(project, own);
    if (match === null) return project;
    const view = {
      ...project,
      title: match.title,
      ...(match.source !== undefined ? { source: match.source } : {}),
      projectIcon: match.projectIcon,
      faviconPath: match.faviconPath,
      faviconEnvironmentId: match.environmentId,
      faviconWorkspaceRoot: match.workspaceRoot,
    };
    if (
      view.title === project.title &&
      view.source === project.source &&
      view.projectIcon === project.projectIcon &&
      view.faviconPath === project.faviconPath &&
      !("faviconEnvironmentId" in project)
    ) {
      return project;
    }
    changed = true;
    return view;
  });
  return changed ? adopted : input.projects;
}
