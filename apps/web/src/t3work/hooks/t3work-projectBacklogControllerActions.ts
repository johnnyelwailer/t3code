import type { Dispatch, SetStateAction } from "react";

import type { AtlassianAssignableUser, BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3work/t3work-types";

import type { BacklogSelectionInput } from "./t3work-projectBacklogCache";
import {
  createProjectBacklogSubtask,
  type ConnectedBacklogSource,
  updateProjectBacklogAssignee,
  updateProjectBacklogEstimate,
} from "./t3work-projectBacklogMutations";
import type { ProjectBacklogState } from "./t3work-projectBacklogState";

const missingConnectionErrorMessage = "Missing Atlassian project connection for this backlog.";

function getConnectedBacklogContext(input: {
  readonly backend: BackendApi | null;
  readonly connectedSource: ConnectedBacklogSource | null;
}) {
  if (!input.backend || !input.connectedSource) {
    throw new Error(missingConnectionErrorMessage);
  }

  return {
    backend: input.backend,
    connectedSource: input.connectedSource,
  };
}

export function createProjectBacklogControllerActions(input: {
  readonly backend: BackendApi | null;
  readonly connectedSource: ConnectedBacklogSource | null;
  readonly projectId: string;
  readonly currentSelection: BacklogSelectionInput;
  readonly setBacklogState: Dispatch<SetStateAction<ProjectBacklogState>>;
  readonly refreshBacklog: (options?: { clearProjectCache?: boolean }) => Promise<void>;
}) {
  return {
    async updateAssignee(
      ticket: ProjectTicket,
      assignee: AtlassianAssignableUser | null,
    ): Promise<void> {
      const { backend, connectedSource } = getConnectedBacklogContext(input);
      return updateProjectBacklogAssignee({
        backend,
        connectedSource,
        currentSelection: input.currentSelection,
        setBacklogState: input.setBacklogState,
        refreshBacklog: input.refreshBacklog,
        ticket,
        assignee,
      });
    },

    async updateEstimate(ticket: ProjectTicket, estimateValue: number | null): Promise<void> {
      const { backend, connectedSource } = getConnectedBacklogContext(input);
      return updateProjectBacklogEstimate({
        backend,
        connectedSource,
        currentSelection: input.currentSelection,
        setBacklogState: input.setBacklogState,
        refreshBacklog: input.refreshBacklog,
        ticket,
        estimateValue,
      });
    },

    async createSubtask(
      ticket: ProjectTicket,
      subtask: ProjectBacklogSubtaskCreateInput,
    ): Promise<void> {
      const { backend, connectedSource } = getConnectedBacklogContext(input);
      return createProjectBacklogSubtask({
        backend,
        connectedSource,
        projectId: input.projectId,
        currentSelection: input.currentSelection,
        setBacklogState: input.setBacklogState,
        refreshBacklog: input.refreshBacklog,
        ticket,
        subtask,
      });
    },
  };
}
