import { useT3TeamPersistedRouteState } from "~/t3team/hooks/t3team-usePersistedRouteState";

export type {
  PersistedProjectDashboardMyWorkState,
  ProjectDashboardMyWorkRouteSearch,
  ProjectDashboardMyWorkState,
  ProjectMyWorkGroupMode,
  ProjectMyWorkKanbanLaneSelectionMode,
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
  ProjectMyWorkViewMode,
} from "./t3team-projectDashboardMyWorkStateShared";
export {
  createDefaultProjectDashboardMyWorkState,
  getProjectDashboardMyWorkStorageKey,
  parseProjectDashboardMyWorkRouteSearch,
  projectDashboardMyWorkRouteSearchKeys,
} from "./t3team-projectDashboardMyWorkStateShared";
export {
  areProjectDashboardMyWorkRouteSearchEqual,
  areProjectDashboardMyWorkStatesEqual,
  buildProjectDashboardMyWorkRouteSearch,
  readPersistedProjectDashboardMyWorkState,
  resolveProjectDashboardMyWorkState,
  stripProjectDashboardMyWorkSearchParams,
  writePersistedProjectDashboardMyWorkState,
} from "./t3team-projectDashboardMyWorkStatePersistence";

import {
  getProjectDashboardMyWorkStorageKey,
  parseProjectDashboardMyWorkRouteSearch,
} from "./t3team-projectDashboardMyWorkStateShared";
import {
  areProjectDashboardMyWorkRouteSearchEqual,
  areProjectDashboardMyWorkStatesEqual,
  buildProjectDashboardMyWorkRouteSearch,
  readPersistedProjectDashboardMyWorkState,
  resolveProjectDashboardMyWorkState,
  stripProjectDashboardMyWorkSearchParams,
  writePersistedProjectDashboardMyWorkState,
} from "./t3team-projectDashboardMyWorkStatePersistence";

export function useProjectDashboardMyWorkState(projectId: string) {
  return useT3TeamPersistedRouteState({
    storageKey: getProjectDashboardMyWorkStorageKey(projectId),
    parseSearch: parseProjectDashboardMyWorkRouteSearch,
    readPersistedState: readPersistedProjectDashboardMyWorkState,
    writePersistedState: writePersistedProjectDashboardMyWorkState,
    resolveState: resolveProjectDashboardMyWorkState,
    buildRouteSearch: buildProjectDashboardMyWorkRouteSearch,
    areStatesEqual: areProjectDashboardMyWorkStatesEqual,
    areRouteSearchEqual: areProjectDashboardMyWorkRouteSearchEqual,
    stripRouteSearchParams: stripProjectDashboardMyWorkSearchParams,
  });
}
