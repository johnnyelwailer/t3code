import type {
  ProjectSidebarRouteSearch,
  ProjectSidebarState,
  PersistedProjectSidebarState,
} from "~/t3team/t3team-projectSidebarState";

import {
  clampProjectSidebarThreadPreviewCount,
  parsePersistedBoolean,
  parseRouteBoolean,
  parseRouteEnum,
  parseRouteInteger,
  projectSortOrderValues,
  threadSortOrderValues,
  ticketViewModeValues,
} from "./t3team-projectSidebarStateParsing";

export const projectSidebarRouteSearchKeys = [
  "navProjectSort",
  "navThreadSort",
  "navThreadCount",
  "navTicketView",
  "navThreads",
  "navActivity",
  "navJira",
  "navGitHub",
] as const;

export { clampProjectSidebarThreadPreviewCount } from "./t3team-projectSidebarStateParsing";

export function createDefaultProjectSidebarState(): ProjectSidebarState {
  return {
    projectSortOrder: "updated_at",
    threadSortOrder: "updated_at",
    threadPreviewCount: 5,
    ticketViewMode: "tree",
    showProjectThreads: true,
    showMyActivityFeed: false,
    showJiraItems: true,
    showGitHubActivity: true,
  };
}

export function getProjectSidebarStorageKey(): string {
  return "t3team:project-sidebar-state:v1";
}

export function parseProjectSidebarRouteSearch(
  search: Record<string, unknown>,
): ProjectSidebarRouteSearch {
  const parsed: ProjectSidebarRouteSearch = {};

  const navProjectSort = parseRouteEnum(search.navProjectSort, projectSortOrderValues);
  if (navProjectSort !== undefined) parsed.navProjectSort = navProjectSort;

  const navThreadSort = parseRouteEnum(search.navThreadSort, threadSortOrderValues);
  if (navThreadSort !== undefined) parsed.navThreadSort = navThreadSort;

  const navThreadCount = parseRouteInteger(search.navThreadCount);
  if (navThreadCount !== undefined) {
    parsed.navThreadCount = clampProjectSidebarThreadPreviewCount(navThreadCount);
  }

  const navTicketView = parseRouteEnum(search.navTicketView, ticketViewModeValues);
  if (navTicketView !== undefined) parsed.navTicketView = navTicketView;

  const navThreads = parseRouteBoolean(search.navThreads);
  if (navThreads !== undefined) parsed.navThreads = navThreads;

  const navActivity = parseRouteBoolean(search.navActivity);
  if (navActivity !== undefined) parsed.navActivity = navActivity;

  const navJira = parseRouteBoolean(search.navJira);
  if (navJira !== undefined) parsed.navJira = navJira;

  const navGitHub = parseRouteBoolean(search.navGitHub);
  if (navGitHub !== undefined) parsed.navGitHub = navGitHub;

  return parsed;
}

export function readPersistedProjectSidebarState(
  storageKey = getProjectSidebarStorageKey(),
): PersistedProjectSidebarState | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const persisted: PersistedProjectSidebarState = {};

    const projectSortOrder = parseRouteEnum(parsed.projectSortOrder, projectSortOrderValues);
    if (projectSortOrder !== undefined) persisted.projectSortOrder = projectSortOrder;

    const threadSortOrder = parseRouteEnum(parsed.threadSortOrder, threadSortOrderValues);
    if (threadSortOrder !== undefined) persisted.threadSortOrder = threadSortOrder;

    const threadPreviewCount = parseRouteInteger(parsed.threadPreviewCount);
    if (threadPreviewCount !== undefined) {
      persisted.threadPreviewCount = clampProjectSidebarThreadPreviewCount(threadPreviewCount);
    }

    const ticketViewMode = parseRouteEnum(parsed.ticketViewMode, ticketViewModeValues);
    if (ticketViewMode !== undefined) persisted.ticketViewMode = ticketViewMode;

    const showProjectThreads = parsePersistedBoolean(parsed.showProjectThreads);
    if (showProjectThreads !== undefined) persisted.showProjectThreads = showProjectThreads;

    const showMyActivityFeed = parsePersistedBoolean(parsed.showMyActivityFeed);
    if (showMyActivityFeed !== undefined) persisted.showMyActivityFeed = showMyActivityFeed;

    const showJiraItems = parsePersistedBoolean(parsed.showJiraItems);
    if (showJiraItems !== undefined) persisted.showJiraItems = showJiraItems;

    const showGitHubActivity = parsePersistedBoolean(parsed.showGitHubActivity);
    if (showGitHubActivity !== undefined) persisted.showGitHubActivity = showGitHubActivity;

    return persisted;
  } catch {
    return null;
  }
}

export function writePersistedProjectSidebarState(
  storageKey: string,
  state: ProjectSidebarState,
): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resolveProjectSidebarState(input: {
  persisted?: PersistedProjectSidebarState | null;
  search?: ProjectSidebarRouteSearch | null;
}): ProjectSidebarState {
  const next: ProjectSidebarState = {
    ...createDefaultProjectSidebarState(),
    ...input.persisted,
  };

  const search = input.search;
  if (!search) {
    return next;
  }

  if (search.navProjectSort !== undefined) next.projectSortOrder = search.navProjectSort;
  if (search.navThreadSort !== undefined) next.threadSortOrder = search.navThreadSort;
  if (search.navThreadCount !== undefined) next.threadPreviewCount = search.navThreadCount;
  if (search.navTicketView !== undefined) next.ticketViewMode = search.navTicketView;
  if (search.navThreads !== undefined) next.showProjectThreads = search.navThreads;
  if (search.navActivity !== undefined) next.showMyActivityFeed = search.navActivity;
  if (search.navJira !== undefined) next.showJiraItems = search.navJira;
  if (search.navGitHub !== undefined) next.showGitHubActivity = search.navGitHub;

  return next;
}

export function buildProjectSidebarRouteSearch(
  state: ProjectSidebarState,
): ProjectSidebarRouteSearch {
  return {
    navProjectSort: state.projectSortOrder,
    navThreadSort: state.threadSortOrder,
    navThreadCount: clampProjectSidebarThreadPreviewCount(state.threadPreviewCount),
    navTicketView: state.ticketViewMode,
    navThreads: state.showProjectThreads,
    navActivity: state.showMyActivityFeed,
    navJira: state.showJiraItems,
    navGitHub: state.showGitHubActivity,
  };
}

export function stripProjectSidebarSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, (typeof projectSidebarRouteSearchKeys)[number]> {
  const next = { ...params } as Record<string, unknown>;
  for (const key of projectSidebarRouteSearchKeys) {
    delete next[key];
  }
  return next as Omit<T, (typeof projectSidebarRouteSearchKeys)[number]>;
}

export function areProjectSidebarStatesEqual(
  left: ProjectSidebarState,
  right: ProjectSidebarState,
): boolean {
  return (
    left.projectSortOrder === right.projectSortOrder &&
    left.threadSortOrder === right.threadSortOrder &&
    left.threadPreviewCount === right.threadPreviewCount &&
    left.ticketViewMode === right.ticketViewMode &&
    left.showProjectThreads === right.showProjectThreads &&
    left.showMyActivityFeed === right.showMyActivityFeed &&
    left.showJiraItems === right.showJiraItems &&
    left.showGitHubActivity === right.showGitHubActivity
  );
}

export function areProjectSidebarRouteSearchEqual(
  left: ProjectSidebarRouteSearch,
  right: ProjectSidebarRouteSearch,
): boolean {
  return projectSidebarRouteSearchKeys.every((key) => left[key] === right[key]);
}
