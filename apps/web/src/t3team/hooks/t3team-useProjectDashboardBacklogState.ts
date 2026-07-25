/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { useT3TeamPersistedRouteState } from "~/t3team/hooks/t3team-usePersistedRouteState";
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

export function useProjectDashboardBacklogState(projectId: string) {
  return useT3TeamPersistedRouteState({
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
}
