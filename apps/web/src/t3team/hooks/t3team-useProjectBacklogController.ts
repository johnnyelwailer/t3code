import type { Dispatch, SetStateAction } from "react";

import type {
  AtlassianAssignableUser,
  AtlassianChildIssueType,
  BackendApi,
} from "~/t3team/backend/t3team-types";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { type BacklogSelectionInput } from "./t3team-projectBacklogCache";
import { searchProjectBacklogAssignableUsers } from "./t3team-projectBacklogRemote";
import { selectProjectBacklogState, type ProjectBacklogState } from "./t3team-projectBacklogState";
import { type ConnectedBacklogSource } from "./t3team-projectBacklogMutations";
import { createProjectBacklogControllerActions } from "./t3team-projectBacklogControllerActions";
import { useProjectBacklogLoader } from "./t3team-useProjectBacklogLoader";

export function useProjectBacklogController(input: {
  readonly backend: BackendApi | null;
  readonly connectedSource: ConnectedBacklogSource | null;
  readonly projectId: string;
  readonly requestedSelection: BacklogSelectionInput;
  readonly currentSelection: BacklogSelectionInput;
  readonly setBacklogState: Dispatch<SetStateAction<ProjectBacklogState>>;
  readonly onSelectionChange?: (selection: BacklogSelectionInput) => void;
}) {
  const { loading, error, hasLoaded, loadBacklog } = useProjectBacklogLoader(input);

  const { updateAssignee, updateEstimate, createSubtask } = createProjectBacklogControllerActions({
    backend: input.backend,
    connectedSource: input.connectedSource,
    projectId: input.projectId,
    currentSelection: input.currentSelection,
    setBacklogState: input.setBacklogState,
    refreshBacklog: (options) =>
      loadBacklog(input.currentSelection, {
        forceRefresh: true,
        ...(options?.clearProjectCache ? { clearProjectCache: true } : {}),
      }),
  });

  async function searchAssignableUsers(
    ticket: ProjectTicket,
    query = "",
  ): Promise<ReadonlyArray<AtlassianAssignableUser>> {
    if (!input.backend || !input.connectedSource) return [];
    return searchProjectBacklogAssignableUsers({
      backend: input.backend.atlassian,
      accountId: input.connectedSource.accountId,
      ticket,
      query,
    });
  }

  async function listChildIssueTypes(): Promise<ReadonlyArray<AtlassianChildIssueType>> {
    if (!input.backend || !input.connectedSource) return [];
    return input.backend.atlassian.listChildIssueTypes({
      accountId: input.connectedSource.accountId,
      projectId: input.projectId,
    });
  }

  function selectBacklog(selection: BacklogSelectionInput): Promise<void> {
    const nextSelection = {
      ...input.currentSelection,
      ...selection,
    };
    input.setBacklogState((current) => selectProjectBacklogState(current, nextSelection));
    return loadBacklog(nextSelection);
  }

  return {
    loading,
    error,
    hasLoaded,
    searchAssignableUsers,
    listChildIssueTypes,
    updateAssignee,
    updateEstimate,
    createSubtask,
    selectBoard: (boardId: string) => selectBacklog({ boardId, sprintId: undefined }),
    selectSprint: (sprintId: string | undefined) => selectBacklog({ sprintId }),
    selectFilter: (filterId: string | undefined) => selectBacklog({ filterId }),
    refreshBacklog: (options?: { clearProjectCache?: boolean }) =>
      loadBacklog(input.currentSelection, {
        forceRefresh: true,
        ...(options?.clearProjectCache ? { clearProjectCache: true } : {}),
      }),
  };
}
