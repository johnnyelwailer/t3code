/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { useT3workPersistedRouteState } from "~/t3work/hooks/t3work-usePersistedRouteState";
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
} from "~/t3work/t3work-projectDashboardBacklogState";

export function useProjectDashboardBacklogState(projectId: string) {
  return useT3workPersistedRouteState({
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
