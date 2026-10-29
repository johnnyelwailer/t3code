import type { EnvironmentId } from "@t3tools/contracts";

import {
  sortHomeProjectScopes,
  type HomeProjectScope,
  type HomeProjectSortOrder,
} from "../features/home/homeThreadList";
import type { HomeFiltersProps } from "./t3team-extensionTypes";

/** What the Chats list already holds that the `homeFilters` slot is derived from. */
export interface HomeFiltersSource {
  readonly threads: Parameters<typeof sortHomeProjectScopes>[0]["threads"];
  readonly pendingTasks: Parameters<typeof sortHomeProjectScopes>[0]["pendingTasks"];
  readonly projectSortOrder: HomeProjectSortOrder;
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly selectedEnvironmentId: EnvironmentId | null;
  readonly selectedProjectKey: string | null;
  readonly onEnvironmentChange: (environmentId: EnvironmentId | null) => void;
  readonly onProjectChange: (projectKey: string | null) => void;
}

/**
 * The slot's props: projects most recently active first (the stock scopes are in grouping order),
 * environments by their ids as plain strings, and selectors that ignore an id or key the list
 * does not know, so a slot cannot select a filter that would empty the list by mistake.
 */
export function buildHomeFiltersProps(
  source: HomeFiltersSource,
  scopes: ReadonlyArray<HomeProjectScope>,
): HomeFiltersProps {
  const projects = sortHomeProjectScopes({
    scopes,
    threads: source.threads,
    pendingTasks: source.pendingTasks,
    projectSortOrder: source.projectSortOrder,
  }).map((scope) => ({ key: scope.key, label: scope.title }));
  return {
    projects,
    selectedProjectKey: source.selectedProjectKey,
    onSelectProject: (key) => {
      if (key === null || projects.some((project) => project.key === key)) {
        source.onProjectChange(key);
      }
    },
    environments: source.environments.map((environment) => ({
      id: environment.environmentId,
      label: environment.label,
    })),
    selectedEnvironmentId: source.selectedEnvironmentId,
    onSelectEnvironment: (id) => {
      if (id === null) return source.onEnvironmentChange(null);
      const environment = source.environments.find((candidate) => candidate.environmentId === id);
      if (environment) source.onEnvironmentChange(environment.environmentId);
    },
  };
}
