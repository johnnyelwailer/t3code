import type {
  AtlassianAssignableUser,
  AtlassianBacklogResponse,
} from "~/t3team/backend/t3team-types";
import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type {
  T3TeamPollResult,
  T3TeamPollingBackend,
} from "~/t3team/backend/t3team-pollingBackend";
import { isProjectTicketHourTracked } from "~/t3team/t3team-projectBacklogUtils";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

import type { BacklogSelectionInput } from "./t3team-projectBacklogCache";

type ProjectBacklogRemoteSource = {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
};

export function listProjectBacklog(input: {
  readonly backend: AtlassianBackendApi;
  readonly source: ProjectBacklogRemoteSource;
  readonly selection?: BacklogSelectionInput;
  readonly forceRefresh?: boolean;
  readonly clearProjectCache?: boolean;
}): Promise<AtlassianBacklogResponse> {
  return input.backend.listBacklog({
    account: {
      id: input.source.accountId,
      provider: input.source.provider,
    },
    externalProjectId: input.source.externalProjectId,
    ...(input.selection?.boardId ? { boardId: input.selection.boardId } : {}),
    ...(input.selection?.sprintId ? { sprintId: input.selection.sprintId } : {}),
    ...(input.selection?.filterId ? { filterId: input.selection.filterId } : {}),
    ...(input.selection?.selectedQuickFilterIds?.length
      ? { quickFilterIds: input.selection.selectedQuickFilterIds }
      : {}),
    ...(input.forceRefresh ? { forceRefresh: true } : {}),
    ...(input.clearProjectCache ? { clearProjectCache: true } : {}),
  });
}

export function pollProjectBacklog(input: {
  readonly backend: T3TeamPollingBackend["atlassian"];
  readonly source: ProjectBacklogRemoteSource;
  readonly selection?: BacklogSelectionInput;
  readonly knownFingerprint?: string;
}): Promise<T3TeamPollResult<AtlassianBacklogResponse>> {
  return input.backend.pollBacklog({
    account: {
      id: input.source.accountId,
      provider: input.source.provider,
    },
    externalProjectId: input.source.externalProjectId,
    ...(input.selection?.boardId ? { boardId: input.selection.boardId } : {}),
    ...(input.selection?.sprintId ? { sprintId: input.selection.sprintId } : {}),
    ...(input.selection?.filterId ? { filterId: input.selection.filterId } : {}),
    ...(input.selection?.selectedQuickFilterIds?.length
      ? { quickFilterIds: input.selection.selectedQuickFilterIds }
      : {}),
    ...(input.knownFingerprint ? { knownFingerprint: input.knownFingerprint } : {}),
  });
}

export function searchProjectBacklogAssignableUsers(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly ticket: ProjectTicket;
  readonly query?: string;
}): Promise<ReadonlyArray<AtlassianAssignableUser>> {
  return input.backend.searchAssignableUsers({
    accountId: input.accountId,
    issueIdOrKey: input.ticket.id,
    ...(input.query?.trim() ? { query: input.query } : {}),
  });
}

export function updateProjectBacklogAssigneeRemote(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly ticket: ProjectTicket;
  readonly assignee: AtlassianAssignableUser | null;
}): Promise<void> {
  return input.backend.updateIssueAssignee({
    accountId: input.accountId,
    issueIdOrKey: input.ticket.id,
    ...(input.assignee
      ? {
          assigneeAccountId: input.assignee.accountId,
          assigneeDisplayName: input.assignee.displayName,
        }
      : {}),
  });
}

export function updateProjectBacklogEstimateRemote(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly ticket: ProjectTicket;
  readonly estimateValue: number | null;
}): Promise<{ label: string; mode: "points" | "hours" }> {
  const mode = isProjectTicketHourTracked(input.ticket) ? "hours" : "points";

  return input.backend
    .updateIssueEstimate({
      accountId: input.accountId,
      issueIdOrKey: input.ticket.id,
      estimateValue: input.estimateValue,
      estimateMode: mode,
    })
    .then((result) => ({ ...result, mode }));
}

export function createProjectBacklogSubtaskRemote(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly externalProjectId: string;
  readonly ticket: ProjectTicket;
  readonly subtask: ProjectBacklogSubtaskCreateInput;
}): ReturnType<AtlassianBackendApi["createSubtask"]> {
  return input.backend.createSubtask({
    accountId: input.accountId,
    projectId: input.externalProjectId,
    parentIssueIdOrKey: input.ticket.ref.displayId,
    summary: input.subtask.summary,
    ...(input.subtask.description ? { description: input.subtask.description } : {}),
    ...(input.subtask.estimateHours !== undefined
      ? { estimateHours: input.subtask.estimateHours }
      : {}),
  });
}
