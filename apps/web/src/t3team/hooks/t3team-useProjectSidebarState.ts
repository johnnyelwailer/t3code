import { useT3TeamPersistedRouteState } from "~/t3team/hooks/t3team-usePersistedRouteState";
import {
  areProjectSidebarRouteSearchEqual,
  areProjectSidebarStatesEqual,
  buildProjectSidebarRouteSearch,
  getProjectSidebarStorageKey,
  parseProjectSidebarRouteSearch,
  readPersistedProjectSidebarState,
  resolveProjectSidebarState,
  stripProjectSidebarSearchParams,
  writePersistedProjectSidebarState,
} from "~/t3team/t3team-projectSidebarState";

export function useProjectSidebarState() {
  return useT3TeamPersistedRouteState({
    storageKey: getProjectSidebarStorageKey(),
    parseSearch: parseProjectSidebarRouteSearch,
    readPersistedState: readPersistedProjectSidebarState,
    writePersistedState: writePersistedProjectSidebarState,
    resolveState: resolveProjectSidebarState,
    buildRouteSearch: buildProjectSidebarRouteSearch,
    areStatesEqual: areProjectSidebarStatesEqual,
    areRouteSearchEqual: areProjectSidebarRouteSearchEqual,
    stripRouteSearchParams: stripProjectSidebarSearchParams,
  });
}
