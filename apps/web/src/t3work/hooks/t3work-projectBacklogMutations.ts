import type { Dispatch, SetStateAction } from "react";

import type { AtlassianAssignableUser, BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3work/t3work-types";
import { resourceRefToProjectTicket } from "~/t3work/t3work-ticketMappers";

import { type BacklogSelectionInput } from "./t3work-projectBacklogCache";
import {
  createProjectBacklogSubtaskRemote,
  updateProjectBacklogAssigneeRemote,
  updateProjectBacklogEstimateRemote,
} from "./t3work-projectBacklogRemote";
import {
  incrementProjectBacklogStateSubtaskCount,
  insertProjectBacklogStateTicket,
  type ProjectBacklogState,
  updateProjectBacklogStateAssignee,
  updateProjectBacklogStateEstimate,
} from "./t3work-projectBacklogState";

export type ConnectedBacklogSource = {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
};

type ProjectBacklogMutationContext = {
  readonly backend: BackendApi;
  readonly connectedSource: ConnectedBacklogSource;
  readonly currentSelection: BacklogSelectionInput;
  readonly setBacklogState: Dispatch<SetStateAction<ProjectBacklogState>>;
  readonly refreshBacklog: (options?: { clearProjectCache?: boolean }) => Promise<void>;
};

export async function updateProjectBacklogAssignee(
  input: ProjectBacklogMutationContext & {
    readonly ticket: ProjectTicket;
    readonly assignee: AtlassianAssignableUser | null;
  },
): Promise<void> {
  await updateProjectBacklogAssigneeRemote({
    backend: input.backend.atlassian,
    accountId: input.connectedSource.accountId,
    ticket: input.ticket,
    assignee: input.assignee,
  });

  input.setBacklogState((current) =>
    updateProjectBacklogStateAssignee(current, input.ticket.id, input.assignee),
  );
}

export async function updateProjectBacklogEstimate(
  input: ProjectBacklogMutationContext & {
    readonly ticket: ProjectTicket;
    readonly estimateValue: number | null;
  },
): Promise<void> {
  const result = await updateProjectBacklogEstimateRemote({
    backend: input.backend.atlassian,
    accountId: input.connectedSource.accountId,
    ticket: input.ticket,
    estimateValue: input.estimateValue,
  });

  input.setBacklogState((current) =>
    updateProjectBacklogStateEstimate(current, input.ticket.id, input.estimateValue, {
      mode: result.mode,
      ...(result.mode === "points" ? { estimateFieldLabel: result.label } : {}),
    }),
  );
}

export async function createProjectBacklogSubtask(
  input: ProjectBacklogMutationContext & {
    readonly projectId: string;
    readonly ticket: ProjectTicket;
    readonly subtask: ProjectBacklogSubtaskCreateInput;
  },
): Promise<void> {
  const created = await createProjectBacklogSubtaskRemote({
    backend: input.backend.atlassian,
    accountId: input.connectedSource.accountId,
    externalProjectId: input.connectedSource.externalProjectId,
    ticket: input.ticket,
    subtask: input.subtask,
  });

  // The server returns the created issue fetched directly by key (Jira's
  // search index lags creation, so a refresh would not include it yet) and has
  // already seeded it into the cache. Insert it into local state so the modal
  // resolves immediately and the subtask shows up with full details; the
  // regular polling loop reconciles afterwards.
  const createdTicket = created.item
    ? resourceRefToProjectTicket(input.projectId, created.item)
    : null;
  input.setBacklogState((current) => {
    const withCount = incrementProjectBacklogStateSubtaskCount(current, input.ticket.id);
    return createdTicket ? insertProjectBacklogStateTicket(withCount, createdTicket) : withCount;
  });

  if (!createdTicket) {
    await input.refreshBacklog();
  }
}
