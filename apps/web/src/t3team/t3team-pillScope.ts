import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentConnectionSummary } from "@t3tools/client-runtime/state/presentation";
import {
  createPillScopeFilter,
  enabledPillEnvironmentId,
  UNSCOPED_PILL_SCOPE,
  type PillScope,
} from "@t3tools/client-runtime/t3team-pillScope";
import type { ScopedProjectRef } from "@t3tools/contracts";

import { usePrimarySettings } from "../hooks/useSettings";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useProjects } from "../state/entities";
import { environmentSummaries } from "../state/presentation";
import { primaryServerSettingsAtom } from "../state/server";
import { useT3TeamSidebarEnvironmentFilterStore } from "./t3team-sidebarEnvironmentFilterStore";
import { useT3TeamSidebarProjectScope } from "./t3team-sidebarProjectScopeStore";

function enabledIdsOf(
  environments: ReadonlyArray<EnvironmentConnectionSummary>,
): ReadonlySet<string> {
  return new Set(environments.filter((env) => env.isEnabled).map((env) => env.environmentId));
}

/** Environments switched on in Settings: only they get a pill. */
export function useT3TeamEnabledEnvironmentIds(): ReadonlySet<string> {
  return enabledIdsOf(useAtomValue(environmentSummaries.environmentsAtom));
}

/**
 * The sidebar pills as the global scope. Off with `t3team.projectScopePills`, the runtime flag:
 * then only the project scope reaches New thread, as before.
 */
function resolvePillScope(input: {
  readonly flagOn: boolean;
  readonly environments: ReadonlyArray<EnvironmentConnectionSummary>;
  readonly storedEnvironmentId: string | null;
  readonly projectRefs: ReadonlyArray<ScopedProjectRef> | null;
}): PillScope<ScopedProjectRef> {
  if (!input.flagOn) {
    return { ...UNSCOPED_PILL_SCOPE, projectRefs: input.projectRefs };
  }
  return {
    environmentId: enabledPillEnvironmentId(
      input.storedEnvironmentId,
      enabledIdsOf(input.environments),
    ),
    projectRefs: input.projectRefs,
  };
}

export function useT3TeamPillScope(): PillScope<ScopedProjectRef> {
  return resolvePillScope({
    flagOn: usePrimarySettings((settings) => settings.t3team.projectScopePills),
    environments: useAtomValue(environmentSummaries.environmentsAtom),
    storedEnvironmentId: useT3TeamSidebarEnvironmentFilterStore(
      (state) => state.selectedEnvironmentId,
    ),
    projectRefs: useT3TeamSidebarProjectScope((state) => state.scopedProjectRefs),
  });
}

/** Event-time twin of `useT3TeamPillScope`, for keyboard commands that run outside React. */
export function readT3TeamPillScope(): PillScope<ScopedProjectRef> {
  return resolvePillScope({
    flagOn: appAtomRegistry.get(primaryServerSettingsAtom).t3team.projectScopePills,
    environments: appAtomRegistry.get(environmentSummaries.environmentsAtom),
    storedEnvironmentId: useT3TeamSidebarEnvironmentFilterStore.getState().selectedEnvironmentId,
    projectRefs: useT3TeamSidebarProjectScope.getState().scopedProjectRefs,
  });
}

/**
 * Whether a thread or project is in the pill scope, for lists outside the sidebar. Every item is
 * in scope while the flag is off, so those lists stay as they were.
 */
export function useT3TeamPillScopeFilter(): (item: {
  readonly environmentId: string;
  readonly projectId: string;
}) => boolean {
  const scope = useT3TeamPillScope();
  const flagOn = usePrimarySettings((settings) => settings.t3team.projectScopePills);
  const projects = useProjects();
  return flagOn ? createPillScopeFilter(scope, projects) : () => true;
}
