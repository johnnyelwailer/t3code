/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { useT3TeamPersistedRouteState } from "~/t3team/hooks/t3team-usePersistedRouteState";
import { offeredBacklogViewMode, useMyWorkViewFlags } from "~/t3team/t3team-myWorkViewFlags";
import {
  areProjectDashboardBacklogRouteSearchEqual,
  areProjectDashboardBacklogStatesEqual,
  buildProjectDashboardBacklogRouteSearch,
  getProjectDashboardBacklogStorageKey,
  parseProjectDashboardBacklogRouteSearch,
  readPersistedProjectDashboardBacklogState,
  resolveProjectDashboardBacklogState,
  stripProjectDashboardBacklogSearchParams,
  writePersistedProjectDashboardBacklogState,
  type ProjectDashboardBacklogState,
} from "~/t3team/t3team-projectDashboardBacklogState";

/** `state.viewMode` is the view on screen: a saved planning space whose flag is off reads as the
 * table. */
export function useProjectDashboardBacklogState(projectId: string) {
  const persisted = useT3TeamPersistedRouteState({
    storageKey: getProjectDashboardBacklogStorageKey(projectId),
    parseSearch: parseProjectDashboardBacklogRouteSearch,
    readPersistedState: () => readPersistedProjectDashboardBacklogState(projectId),
    writePersistedState: (_storageKey, state) =>
      writePersistedProjectDashboardBacklogState(projectId, state),
    resolveState: resolveProjectDashboardBacklogState,
    buildRouteSearch: buildProjectDashboardBacklogRouteSearch,
    areStatesEqual: areProjectDashboardBacklogStatesEqual,
    areRouteSearchEqual: areProjectDashboardBacklogRouteSearchEqual,
    stripRouteSearchParams: stripProjectDashboardBacklogSearchParams,
  });
  const viewMode = offeredBacklogViewMode(persisted.state.viewMode, useMyWorkViewFlags());
  const state =
    viewMode === persisted.state.viewMode ? persisted.state : { ...persisted.state, viewMode };
  return { state, setState: persisted.setState };
}
