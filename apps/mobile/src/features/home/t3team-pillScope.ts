import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentCatalogState,
  enabledEnvironmentIds,
} from "@t3tools/client-runtime/state/connections";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  createPillScopeFilter,
  enabledPillEnvironmentId,
  pickPillScopedProject,
  pillScopeFlagOn,
  type PillScope,
} from "@t3tools/client-runtime/t3team-pillScope";
import type { EnvironmentId, SidebarProjectGroupingMode } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";

import { environmentCatalog } from "../../connection/catalog";
import type { ThreadListFilters } from "../../persistence/mobile-preferences";
import { appAtomRegistry } from "../../state/atom-registry";
import { useProjects } from "../../state/entities";
import { mobilePreferencesAtom } from "../../state/preferences";
import {
  DEFAULT_MOBILE_PROJECT_GROUPING_SETTINGS,
  resolveMobileProjectGroupingSettings,
} from "../../state/project-grouping.logic";
import { environmentServerConfigsAtom } from "../../state/server";
import { buildHomeProjectScopes } from "./homeThreadList";

/** Environments switched off in Settings get no pill; every environment does with the flag off. */
export function pillEnvironmentIds(
  catalog: EnvironmentCatalogState,
  flagOn: boolean,
): ReadonlySet<EnvironmentId> {
  return new Set(flagOn ? enabledEnvironmentIds(catalog) : catalog.entries.keys());
}

export function usePillEnvironmentIds(): ReadonlySet<EnvironmentId> {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const flagOn = pillScopeFlagOn(useAtomValue(environmentServerConfigsAtom).values());
  return useMemo(() => pillEnvironmentIds(catalog, flagOn), [catalog, flagOn]);
}

type HomePillScopeInput = {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly filters: ThreadListFilters | undefined;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly pillEnvironmentIds: ReadonlySet<string>;
};

/** The saved Home pills as a scope; a switched-off environment reads as "All". */
export function homePillScope(input: HomePillScopeInput): PillScope {
  const projectKey = input.filters?.projectKey ?? null;
  const group =
    projectKey === null
      ? undefined
      : buildHomeProjectScopes({
          projects: input.projects,
          environmentId: null,
          projectGroupingMode: input.projectGroupingMode,
        }).find((candidate) => candidate.key === projectKey);
  return {
    environmentId: enabledPillEnvironmentId(
      input.filters?.environmentId ?? null,
      input.pillEnvironmentIds,
    ),
    projectRefs: group?.projectRefs ?? null,
  };
}

/** The project New task preselects from the saved Home pills, or undefined to keep the default. */
export function pillScopedNewTaskProject(
  input: HomePillScopeInput,
): { readonly environmentId: string; readonly projectId: string } | undefined {
  const projects = input.projects.filter((project) => project.archivedAt == null);
  const project = pickPillScopedProject({
    orderedProjects: projects,
    scope: homePillScope({ ...input, projects }),
    offlineEnvironmentIds: new Set(),
    fallback: undefined,
  });
  return project ? { environmentId: project.environmentId, projectId: project.id } : undefined;
}

/** Event-time read for the New task handler, which runs outside render. */
export function readPillScopedNewTaskProject(
  input: Omit<HomePillScopeInput, "pillEnvironmentIds">,
) {
  const flagOn = pillScopeFlagOn(appAtomRegistry.get(environmentServerConfigsAtom).values());
  if (!flagOn) return undefined;
  return pillScopedNewTaskProject({
    ...input,
    pillEnvironmentIds: pillEnvironmentIds(
      appAtomRegistry.get(environmentCatalog.catalogValueAtom),
      flagOn,
    ),
  });
}

/**
 * Whether a thread is in the saved Home pill scope, for lists outside Home. The keyboard palette
 * renders above the Home options provider, so it reads the saved filters.
 */
export function useHomePillScopeFilter(): (item: {
  readonly environmentId: string;
  readonly projectId: string;
}) => boolean {
  const flagOn = pillScopeFlagOn(useAtomValue(environmentServerConfigsAtom).values());
  const ids = usePillEnvironmentIds();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const saved = AsyncResult.isSuccess(preferences) ? preferences.value : undefined;
  const filters = saved?.threadListFilters;
  const projectGroupingMode = saved
    ? resolveMobileProjectGroupingSettings(saved).sidebarProjectGroupingMode
    : DEFAULT_MOBILE_PROJECT_GROUPING_SETTINGS.sidebarProjectGroupingMode;
  const projects = useProjects();
  return useMemo(
    () =>
      flagOn
        ? createPillScopeFilter(
            homePillScope({ projects, filters, projectGroupingMode, pillEnvironmentIds: ids }),
            projects,
          )
        : () => true,
    [flagOn, ids, filters, projectGroupingMode, projects],
  );
}
