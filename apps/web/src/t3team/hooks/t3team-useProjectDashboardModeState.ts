import { useT3TeamPersistedRouteState } from "~/t3team/hooks/t3team-usePersistedRouteState";
import {
  areProjectDashboardModeRouteSearchEqual,
  areProjectDashboardModeStatesEqual,
  buildProjectDashboardModeRouteSearch,
  getProjectDashboardModeStorageKey,
  parseProjectDashboardModeRouteSearch,
  readPersistedProjectDashboardModeState,
  resolveProjectDashboardModeState,
  stripProjectDashboardModeSearchParams,
  writePersistedProjectDashboardModeState,
} from "~/t3team/t3team-projectDashboardModeState";

export function useProjectDashboardModeState(projectId: string) {
  return useT3TeamPersistedRouteState({
    storageKey: getProjectDashboardModeStorageKey(projectId),
    parseSearch: parseProjectDashboardModeRouteSearch,
    readPersistedState: readPersistedProjectDashboardModeState,
    writePersistedState: writePersistedProjectDashboardModeState,
    resolveState: resolveProjectDashboardModeState,
    buildRouteSearch: buildProjectDashboardModeRouteSearch,
    areStatesEqual: areProjectDashboardModeStatesEqual,
    areRouteSearchEqual: areProjectDashboardModeRouteSearchEqual,
    stripRouteSearchParams: stripProjectDashboardModeSearchParams,
  });
}
