import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  createPillScopeFilter,
  heldPillEnvironmentId,
  pickPillScopedProject,
  pillScopeFlagOn,
  type PillScope,
} from "@t3tools/client-runtime/t3team-pillScope";
import type { EnvironmentId, SidebarProjectGroupingMode } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
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
import {
  environmentConnectedAtom,
  savedConnectionsByIdAtom,
} from "../../state/use-remote-environment-registry";
import { environmentServerConfigsAtom } from "../../state/server";
import { buildHomeProjectScopes } from "./homeThreadList";

/**
 * The environments the Home pills offer: saved connections switched on in Settings. `null` while
 * the flag is off, so Home keeps every saved connection exactly as before.
 */
export function pillEnvironmentIds(input: {
  readonly savedEnvironmentIds: Iterable<EnvironmentId>;
  readonly enabledEnvironmentIds: Iterable<EnvironmentId>;
  readonly flagOn: boolean;
}): ReadonlySet<EnvironmentId> | null {
  if (!input.flagOn) return null;
  const enabled = new Set(input.enabledEnvironmentIds);
  return new Set([...input.savedEnvironmentIds].filter((id) => enabled.has(id)));
}

const pillEnvironmentIdsAtom = Atom.make((get) =>
  pillEnvironmentIds({
    savedEnvironmentIds: Object.values(get(savedConnectionsByIdAtom)).map(
      (connection) => connection.environmentId,
    ),
    enabledEnvironmentIds: enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom)),
    flagOn: pillScopeFlagOn(get(environmentServerConfigsAtom).values()),
  }),
).pipe(Atom.withLabel("mobile:t3team-pill-environment-ids"));

/** One set for Home, the tablet sidebar and the scope; `null` means the flag is off. */
export function usePillEnvironmentIds(): ReadonlySet<EnvironmentId> | null {
  return useAtomValue(pillEnvironmentIdsAtom);
}

type HomePillScopeInput = {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly filters: ThreadListFilters | undefined;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly pillEnvironmentIds: ReadonlySet<string>;
};

/** The saved Home pills as a scope; a selection the pills no longer offer reads as "All". */
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
    environmentId: heldPillEnvironmentId(
      input.filters?.environmentId ?? null,
      input.pillEnvironmentIds,
    ),
    projectRefs: group?.projectRefs ?? null,
  };
}

/**
 * The project New task preselects from the saved Home pills, skipping disconnected environments
 * as desktop does; undefined keeps the default (current or remembered project, else the picker).
 */
export function pillScopedNewTaskProject(
  input: HomePillScopeInput & { readonly disconnectedEnvironmentIds: ReadonlySet<string> },
): { readonly environmentId: string; readonly projectId: string } | undefined {
  const projects = input.projects.filter((project) => project.archivedAt == null);
  const project = pickPillScopedProject({
    orderedProjects: projects,
    scope: homePillScope({ ...input, projects }),
    offlineEnvironmentIds: input.disconnectedEnvironmentIds,
    fallback: undefined,
  });
  return project ? { environmentId: project.environmentId, projectId: project.id } : undefined;
}

/** Event-time read for the New task handler, which runs outside render. */
export function readPillScopedNewTaskProject(
  input: Omit<HomePillScopeInput, "pillEnvironmentIds">,
) {
  const offered = appAtomRegistry.get(pillEnvironmentIdsAtom);
  if (offered === null) return undefined;
  const disconnected = new Set(
    input.projects
      .map((project) => project.environmentId)
      .filter((environmentId) => !appAtomRegistry.get(environmentConnectedAtom(environmentId))),
  );
  return pillScopedNewTaskProject({
    ...input,
    pillEnvironmentIds: offered,
    disconnectedEnvironmentIds: disconnected,
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
  const offered = usePillEnvironmentIds();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const saved = AsyncResult.isSuccess(preferences) ? preferences.value : undefined;
  const filters = saved?.threadListFilters;
  const projectGroupingMode = saved
    ? resolveMobileProjectGroupingSettings(saved).sidebarProjectGroupingMode
    : DEFAULT_MOBILE_PROJECT_GROUPING_SETTINGS.sidebarProjectGroupingMode;
  const projects = useProjects();
  return useMemo(
    () =>
      offered === null
        ? () => true
        : createPillScopeFilter(
            homePillScope({ projects, filters, projectGroupingMode, pillEnvironmentIds: offered }),
            projects,
          ),
    [offered, filters, projectGroupingMode, projects],
  );
}
