import {
  createDefaultProjectDashboardBacklogState,
  type ProjectDashboardBacklogState,
} from "~/t3work/t3work-projectDashboardBacklogStateShared";
import {
  createDefaultProjectDashboardMyWorkState,
  type ProjectDashboardMyWorkState,
} from "~/t3work/t3work-projectDashboardMyWorkState";
import {
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  type ProjectBacklogFocusFilter,
} from "~/t3work/t3work-projectBacklogUtils";

export function hasBacklogViewFiltersActive(input: {
  readonly query: string;
  readonly focusFilter: ProjectBacklogFocusFilter;
  readonly assigneeFilter: string;
}): boolean {
  return (
    input.focusFilter !== "all" ||
    input.assigneeFilter !== PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL ||
    input.query.trim().length > 0
  );
}

export function hasMyWorkViewFiltersActive(state: ProjectDashboardMyWorkState): boolean {
  const defaults = createDefaultProjectDashboardMyWorkState();
  return (
    state.query.trim().length > 0 ||
    state.statusCategory !== defaults.statusCategory ||
    state.selectedPriority !== defaults.selectedPriority ||
    state.selectedStatus !== defaults.selectedStatus ||
    state.showGitHubActivity !== defaults.showGitHubActivity
  );
}

export function buildBacklogClearFiltersOutcome(state: ProjectDashboardBacklogState): {
  readonly nextState: ProjectDashboardBacklogState;
  readonly promptText: string;
} {
  if (
    !hasBacklogViewFiltersActive({
      query: state.query,
      focusFilter: state.focusFilter,
      assigneeFilter: state.assigneeFilter,
    })
  ) {
    return {
      nextState: state,
      promptText: "No active view filters to clear.",
    };
  }

  const defaults = createDefaultProjectDashboardBacklogState();
  return {
    nextState: {
      ...state,
      focusFilter: "all",
      assigneeFilter: PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
      assigneeFilterScope: defaults.assigneeFilterScope,
      query: "",
    },
    promptText: "Cleared active view filters.",
  };
}

export function buildMyWorkClearFiltersOutcome(state: ProjectDashboardMyWorkState): {
  readonly nextState: ProjectDashboardMyWorkState;
  readonly promptText: string;
} {
  if (!hasMyWorkViewFiltersActive(state)) {
    return {
      nextState: state,
      promptText: "No active view filters to clear.",
    };
  }

  const defaults = createDefaultProjectDashboardMyWorkState();
  return {
    nextState: {
      ...state,
      query: defaults.query,
      statusCategory: defaults.statusCategory,
      selectedPriority: defaults.selectedPriority,
      selectedStatus: defaults.selectedStatus,
      showGitHubActivity: defaults.showGitHubActivity,
    },
    promptText: "Cleared active view filters.",
  };
}
