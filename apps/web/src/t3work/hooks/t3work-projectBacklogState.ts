import type {
  AtlassianAssignableUser,
  AtlassianBacklogBoard,
  AtlassianBacklogCapabilities,
  AtlassianBacklogResponse,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
} from "~/t3work/backend/t3work-types";
import { resourceRefToProjectTicket } from "../t3work-ticketMappers";
import type { ProjectTicket } from "~/t3work/t3work-types";

import {
  DEFAULT_PROJECT_BACKLOG_CAPABILITIES,
  type BacklogSelectionInput,
} from "./t3work-projectBacklogCache";

export type ProjectBacklogState = {
  readonly tickets: ReadonlyArray<ProjectTicket>;
  readonly capabilities: AtlassianBacklogCapabilities;
  readonly boards: ReadonlyArray<AtlassianBacklogBoard>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
  readonly savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  readonly selectedBoardId?: string | undefined;
  readonly selectedSprintId?: string | undefined;
  readonly selectedFilterId?: string | undefined;
};

export function createProjectBacklogState(
  projectId: string,
  response?: AtlassianBacklogResponse,
): ProjectBacklogState {
  if (!response) {
    return {
      tickets: [],
      capabilities: DEFAULT_PROJECT_BACKLOG_CAPABILITIES,
      boards: [],
      sprints: [],
      savedFilters: [],
    };
  }

  return {
    tickets: response.page.items.map((item) => resourceRefToProjectTicket(projectId, item)),
    capabilities: response.capabilities,
    boards: response.boards,
    sprints: response.sprints,
    savedFilters: response.savedFilters,
    selectedBoardId: response.selectedBoardId,
    selectedSprintId: response.selectedSprintId,
    selectedFilterId: response.selectedFilterId,
  };
}

export function buildProjectBacklogSelection(
  state: Pick<ProjectBacklogState, "selectedBoardId" | "selectedSprintId" | "selectedFilterId">,
): BacklogSelectionInput {
  return {
    ...(state.selectedBoardId ? { boardId: state.selectedBoardId } : {}),
    ...(state.selectedSprintId ? { sprintId: state.selectedSprintId } : {}),
    ...(state.selectedFilterId ? { filterId: state.selectedFilterId } : {}),
  };
}

export function selectProjectBacklogState(
  state: ProjectBacklogState,
  selection: BacklogSelectionInput,
): ProjectBacklogState {
  return {
    ...state,
    selectedBoardId: selection.boardId,
    selectedSprintId: selection.sprintId,
    selectedFilterId: selection.filterId,
  };
}

export function resolveRequestedProjectBacklogState({
  currentState,
  projectId,
  previousProjectId,
  selection,
  response,
}: {
  currentState: ProjectBacklogState;
  projectId: string;
  previousProjectId: string;
  selection: BacklogSelectionInput;
  response?: AtlassianBacklogResponse;
}): ProjectBacklogState {
  if (response) {
    return createProjectBacklogState(projectId, response);
  }

  if (previousProjectId !== projectId) {
    return createProjectBacklogState(projectId);
  }

  return selectProjectBacklogState(currentState, selection);
}

export function updateProjectBacklogStateAssignee(
  state: ProjectBacklogState,
  ticketId: string,
  assignee: AtlassianAssignableUser | null,
): ProjectBacklogState {
  return {
    ...state,
    tickets: state.tickets.map((ticket) => {
      if (ticket.id !== ticketId) {
        return ticket;
      }
      if (!assignee) {
        const { assignee: _assignee, assigneeAccountId: _assigneeAccountId, ...rest } = ticket;
        return rest;
      }
      return {
        ...ticket,
        assignee: assignee.displayName,
        assigneeAccountId: assignee.accountId,
      };
    }),
  };
}

export function updateProjectBacklogStateEstimate(
  state: ProjectBacklogState,
  ticketId: string,
  estimateValue: number | null,
  options: {
    mode: "points" | "hours";
    estimateFieldLabel?: string;
  },
): ProjectBacklogState {
  return {
    ...state,
    tickets: state.tickets.map((ticket) => {
      if (ticket.id !== ticketId) {
        return ticket;
      }
      if (estimateValue === null) {
        if (options.mode === "hours") {
          const {
            estimateValue: _estimateValue,
            timeOriginalEstimateSeconds: _timeOriginalEstimateSeconds,
            ...rest
          } = ticket;
          return rest;
        }

        const { estimateValue: _estimateValue, ...rest } = ticket;
        return rest;
      }

      if (options.mode === "hours") {
        return {
          ...ticket,
          estimateValue,
          timeOriginalEstimateSeconds: Math.round(estimateValue * 3600),
        };
      }

      return { ...ticket, estimateValue };
    }),
    capabilities: {
      ...state.capabilities,
      ...(options.mode === "points" && options.estimateFieldLabel
        ? { estimateFieldLabel: options.estimateFieldLabel }
        : {}),
    },
  };
}

export function insertProjectBacklogStateTicket(
  state: ProjectBacklogState,
  ticket: ProjectTicket,
): ProjectBacklogState {
  if (state.tickets.some((existing) => existing.id === ticket.id)) {
    return state;
  }
  return {
    ...state,
    tickets: [...state.tickets, ticket],
  };
}

export function incrementProjectBacklogStateSubtaskCount(
  state: ProjectBacklogState,
  ticketId: string,
): ProjectBacklogState {
  return {
    ...state,
    tickets: state.tickets.map((ticket) => {
      if (ticket.id !== ticketId) {
        return ticket;
      }

      return {
        ...ticket,
        subtaskCount: (ticket.subtaskCount ?? 0) + 1,
      };
    }),
  };
}
