export type ProjectDashboardMode = "backlog" | "my-work";

export interface ProjectDashboardModeRouteSearch {
  projectView?: ProjectDashboardMode;
}

export interface ProjectDashboardModeState {
  dashboardMode: ProjectDashboardMode;
}

export type PersistedProjectDashboardModeState = Partial<ProjectDashboardModeState>;

const projectDashboardModeValues = new Set<ProjectDashboardMode>(["backlog", "my-work"]);

export const projectDashboardModeRouteSearchKeys = ["projectView"] as const;

function parseRouteEnum<TValue extends string>(
  value: unknown,
  allowedValues: ReadonlySet<TValue>,
): TValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return allowedValues.has(value as TValue) ? (value as TValue) : undefined;
}

export function createDefaultProjectDashboardModeState(): ProjectDashboardModeState {
  return {
    dashboardMode: "my-work",
  };
}

export function getProjectDashboardModeStorageKey(projectId: string): string {
  return `t3team:project-dashboard-mode-state:v1:${projectId}`;
}

export function parseProjectDashboardModeRouteSearch(
  search: Record<string, unknown>,
): ProjectDashboardModeRouteSearch {
  const parsed: ProjectDashboardModeRouteSearch = {};

  const projectView = parseRouteEnum(search.projectView, projectDashboardModeValues);
  if (projectView !== undefined) {
    parsed.projectView = projectView;
  }

  return parsed;
}

export function readPersistedProjectDashboardModeState(
  storageKey: string,
): PersistedProjectDashboardModeState | null {
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

    const dashboardMode = parseRouteEnum(parsed.dashboardMode, projectDashboardModeValues);
    return dashboardMode !== undefined ? { dashboardMode } : null;
  } catch {
    return null;
  }
}

export function writePersistedProjectDashboardModeState(
  storageKey: string,
  state: ProjectDashboardModeState,
): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resolveProjectDashboardModeState(input: {
  persisted?: PersistedProjectDashboardModeState | null;
  search?: ProjectDashboardModeRouteSearch | null;
}): ProjectDashboardModeState {
  const next: ProjectDashboardModeState = {
    ...createDefaultProjectDashboardModeState(),
    ...input.persisted,
  };

  if (input.search?.projectView !== undefined) {
    next.dashboardMode = input.search.projectView;
  }

  return next;
}

export function buildProjectDashboardModeRouteSearch(
  state: ProjectDashboardModeState,
): ProjectDashboardModeRouteSearch {
  return {
    projectView: state.dashboardMode,
  };
}

export function stripProjectDashboardModeSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, (typeof projectDashboardModeRouteSearchKeys)[number]> {
  const next = { ...params } as Record<string, unknown>;
  for (const key of projectDashboardModeRouteSearchKeys) {
    delete next[key];
  }
  return next as Omit<T, (typeof projectDashboardModeRouteSearchKeys)[number]>;
}

export function areProjectDashboardModeStatesEqual(
  left: ProjectDashboardModeState,
  right: ProjectDashboardModeState,
): boolean {
  return left.dashboardMode === right.dashboardMode;
}

export function areProjectDashboardModeRouteSearchEqual(
  left: ProjectDashboardModeRouteSearch,
  right: ProjectDashboardModeRouteSearch,
): boolean {
  return projectDashboardModeRouteSearchKeys.every((key) => left[key] === right[key]);
}
