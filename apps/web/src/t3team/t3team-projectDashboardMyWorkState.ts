import { useT3TeamPersistedRouteState } from "~/t3team/hooks/t3team-usePersistedRouteState";
import { offeredMyWorkLens, useMyWorkViewFlags } from "~/t3team/t3team-myWorkViewFlags";

export type {
  PersistedProjectDashboardMyWorkState,
  ProjectDashboardMyWorkRouteSearch,
  ProjectDashboardMyWorkState,
  ProjectMyWorkGroupMode,
  ProjectMyWorkKanbanLaneSelectionMode,
  ProjectMyWorkLens,
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

/** `state.lens` is the lens on screen: a saved lens whose feature is off reads as the List lens. */
export function useProjectDashboardMyWorkState(projectId: string) {
  const persisted = useT3TeamPersistedRouteState({
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
  const lens = offeredMyWorkLens(persisted.state.lens, useMyWorkViewFlags());
  const state = lens === persisted.state.lens ? persisted.state : { ...persisted.state, lens };
  return { state, setState: persisted.setState };
}
