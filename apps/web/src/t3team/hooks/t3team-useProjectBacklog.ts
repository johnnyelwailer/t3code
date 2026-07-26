import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";

import {
  purgeLegacyProjectBacklogLocalCache,
  type BacklogSelectionInput,
} from "./t3team-projectBacklogCache";
import { useProjectWorkspaceAutoSync } from "./t3team-useProjectWorkspaceAutoSync";
import {
  buildProjectBacklogSelection,
  createProjectBacklogState,
  resolveRequestedProjectBacklogState,
} from "./t3team-projectBacklogState";
import { useProjectBacklogController } from "./t3team-useProjectBacklogController";

export function useProjectBacklog(
  project: ProjectShellProject,
  options: {
    selection?: BacklogSelectionInput;
    onSelectionChange?: (selection: BacklogSelectionInput) => void;
  } = {},
) {
  const backend = useBackend();
  const requestedSelection = useMemo(
    () => ({
      ...(options.selection?.boardId ? { boardId: options.selection.boardId } : {}),
      ...(options.selection?.sprintId ? { sprintId: options.selection.sprintId } : {}),
      ...(options.selection?.filterId ? { filterId: options.selection.filterId } : {}),
      ...(options.selection?.selectedQuickFilterIds?.length
        ? { selectedQuickFilterIds: options.selection.selectedQuickFilterIds }
        : {}),
    }),
    [
      options.selection?.boardId,
      options.selection?.filterId,
      options.selection?.selectedQuickFilterIds,
      options.selection?.sprintId,
    ],
  );
  const [backlogState, setBacklogState] = useState(() => createProjectBacklogState(project.id));
  const previousProjectIdRef = useRef(project.id);

  useEffect(() => {
    purgeLegacyProjectBacklogLocalCache();
  }, []);

  const connectedSource = useMemo(
    () =>
      project.source.accountId && project.source.externalProjectId
        ? {
            provider: project.source.provider,
            accountId: project.source.accountId,
            externalProjectId: project.source.externalProjectId,
          }
        : null,
    [project.source.accountId, project.source.externalProjectId, project.source.provider],
  );

  const currentSelection = useMemo<BacklogSelectionInput>(
    () =>
      buildProjectBacklogSelection({
        selectedBoardId: backlogState.selectedBoardId,
        selectedSprintId: backlogState.selectedSprintId,
        selectedFilterId: backlogState.selectedFilterId,
      }),
    [backlogState.selectedBoardId, backlogState.selectedFilterId, backlogState.selectedSprintId],
  );

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;
    previousProjectIdRef.current = project.id;

    setBacklogState((current) =>
      resolveRequestedProjectBacklogState({
        currentState: current,
        projectId: project.id,
        previousProjectId,
        selection: requestedSelection,
      }),
    );
  }, [project.id, requestedSelection]);

  const controller = useProjectBacklogController({
    backend,
    connectedSource,
    projectId: project.id,
    requestedSelection,
    currentSelection,
    setBacklogState,
    ...(options.onSelectionChange ? { onSelectionChange: options.onSelectionChange } : {}),
  });
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  useProjectWorkspaceAutoSync({
    project,
    ...(controller.hasLoaded ? { projectTickets: backlogState.tickets } : {}),
  });

  const selectBoard = useCallback(
    (boardId: string) => controllerRef.current.selectBoard(boardId),
    [],
  );
  const selectSprint = useCallback(
    (sprintId: string | undefined) => controllerRef.current.selectSprint(sprintId),
    [],
  );
  const selectFilter = useCallback(
    (filterId: string | undefined) => controllerRef.current.selectFilter(filterId),
    [],
  );
  const searchAssignableUsers = useCallback(
    (ticket: Parameters<typeof controller.searchAssignableUsers>[0], query?: string) =>
      controllerRef.current.searchAssignableUsers(ticket, query),
    [],
  );
  const listChildIssueTypes = useCallback(() => controllerRef.current.listChildIssueTypes(), []);
  const updateAssignee = useCallback(
    (
      ticket: Parameters<typeof controller.updateAssignee>[0],
      assignee: Parameters<typeof controller.updateAssignee>[1],
    ) => controllerRef.current.updateAssignee(ticket, assignee),
    [],
  );
  const updateEstimate = useCallback(
    (
      ticket: Parameters<typeof controller.updateEstimate>[0],
      estimateValue: Parameters<typeof controller.updateEstimate>[1],
    ) => controllerRef.current.updateEstimate(ticket, estimateValue),
    [],
  );
  const createSubtask = useCallback(
    (
      ticket: Parameters<typeof controller.createSubtask>[0],
      subtask: Parameters<typeof controller.createSubtask>[1],
    ) => controllerRef.current.createSubtask(ticket, subtask),
    [],
  );
  const refreshBacklog = useCallback(
    (options?: Parameters<typeof controller.refreshBacklog>[0]) =>
      controllerRef.current.refreshBacklog(options),
    [],
  );

  return {
    tickets: backlogState.tickets,
    capabilities: backlogState.capabilities,
    boards: backlogState.boards,
    sprints: backlogState.sprints,
    savedFilters: backlogState.savedFilters,
    quickFilters: backlogState.quickFilters,
    selectedBoardId: backlogState.selectedBoardId,
    selectedSprintId: backlogState.selectedSprintId,
    selectedFilterId: backlogState.selectedFilterId,
    loading: controller.loading,
    error: controller.error,
    hasLoaded: controller.hasLoaded,
    selectBoard,
    selectSprint,
    selectFilter,
    searchAssignableUsers,
    listChildIssueTypes,
    updateAssignee,
    updateEstimate,
    createSubtask,
    refreshBacklog,
  };
}
