import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentConnectionSummary } from "@t3tools/client-runtime/state/presentation";
import {
  createPillScopeFilter,
  PILL_SCOPE_FLAG,
  UNSCOPED_PILL_SCOPE,
  type PillScope,
} from "@t3tools/client-runtime/t3team-pillScope";
import type { ScopedProjectRef } from "@t3tools/contracts";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { useProjects } from "../state/entities";
import { environmentSummaries } from "../state/presentation";
import { primaryServerConfigAtom } from "../state/server";
import { readServerFeatureFlag, useFeatureFlag } from "./t3team-useFeatureFlag";
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
 * The sidebar pills as the global scope, behind `UI_PILL_GLOBAL_SCOPE`. The environment is the
 * one the sidebar applies (`heldEnvironmentId`), so a stale saved selection never scopes anything
 * the sidebar shows as "All". Off, only the project scope reaches New thread, as before.
 */
function resolvePillScope(input: {
  readonly flagOn: boolean;
  readonly heldEnvironmentId: string | null;
  readonly projectRefs: ReadonlyArray<ScopedProjectRef> | null;
}): PillScope<ScopedProjectRef> {
  return {
    environmentId: input.flagOn ? input.heldEnvironmentId : UNSCOPED_PILL_SCOPE.environmentId,
    projectRefs: input.projectRefs,
  };
}

export function useT3TeamPillScope(): PillScope<ScopedProjectRef> {
  return resolvePillScope({
    flagOn: useFeatureFlag(PILL_SCOPE_FLAG),
    heldEnvironmentId: useT3TeamSidebarEnvironmentFilterStore((state) => state.heldEnvironmentId),
    projectRefs: useT3TeamSidebarProjectScope((state) => state.scopedProjectRefs),
  });
}

/** Event-time twin of `useT3TeamPillScope`, for keyboard commands that run outside React. */
export function readT3TeamPillScope(): PillScope<ScopedProjectRef> {
  return resolvePillScope({
    flagOn: readServerFeatureFlag(appAtomRegistry.get(primaryServerConfigAtom), PILL_SCOPE_FLAG),
    heldEnvironmentId: useT3TeamSidebarEnvironmentFilterStore.getState().heldEnvironmentId,
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
  const flagOn = useFeatureFlag(PILL_SCOPE_FLAG);
  const projects = useProjects();
  return flagOn ? createPillScopeFilter(scope, projects) : () => true;
}
