import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AddToChatTarget } from "~/t3team/hooks/t3team-useAddToChat";
import { buildTicketSidebarAddToChatRequest } from "~/t3team/components/t3team-projectSidebarAddToChatRequests";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";

export type WorkItemContextSyncQueueRequest = {
  readonly id: string;
  readonly projectId: string;
  readonly ticketKey: string;
  readonly threadId: string;
};

export type WorkItemContextSyncQueueDrainInput = {
  readonly queuedRequests: ReadonlyArray<WorkItemContextSyncQueueRequest>;
  readonly completedRequestIds: ReadonlySet<string>;
  readonly readProjectTickets: () => ReadonlyArray<ProjectTicket>;
  readonly ensureFullWorkItemContextBundle: (input: {
    readonly projectId: string;
    readonly ticket: ProjectTicket;
    readonly request: WorkItemContextSyncQueueRequest;
  }) => Promise<void>;
};

const queuedRequests: WorkItemContextSyncQueueRequest[] = [];
const completedRequestIds = new Set<string>();

function ticketMatchesKey(ticket: ProjectTicket, ticketKey: string): boolean {
  return (
    ticket.ref.displayId === ticketKey || ticket.ref.id === ticketKey || ticket.id === ticketKey
  );
}

export function enqueueWorkItemContextSyncRequest(request: WorkItemContextSyncQueueRequest): void {
  if (completedRequestIds.has(request.id)) return;
  if (queuedRequests.some((candidate) => candidate.id === request.id)) return;
  queuedRequests.push(request);
}

export function readQueuedWorkItemContextSyncRequests(): ReadonlyArray<WorkItemContextSyncQueueRequest> {
  return queuedRequests;
}

export function resetWorkItemContextSyncQueueForTests(): void {
  queuedRequests.length = 0;
  completedRequestIds.clear();
}

export async function drainWorkItemContextSyncQueueOnce(
  input: WorkItemContextSyncQueueDrainInput,
): Promise<ReadonlySet<string>> {
  const nextCompletedRequestIds = new Set(input.completedRequestIds);

  for (const request of input.queuedRequests) {
    if (nextCompletedRequestIds.has(request.id)) continue;

    const ticket = input
      .readProjectTickets()
      .find((candidate) => ticketMatchesKey(candidate, request.ticketKey));
    if (!ticket) continue;

    await input.ensureFullWorkItemContextBundle({
      projectId: request.projectId,
      ticket,
      request,
    });
    nextCompletedRequestIds.add(request.id);
  }

  return nextCompletedRequestIds;
}

export async function drainQueuedWorkItemContextSyncRequests(input: {
  readonly addToChatFromRequest: (
    request: AddToChatRequest,
    target: AddToChatTarget,
  ) => Promise<void> | void;
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  readonly projectTickets: ReadonlyArray<ProjectTicket>;
}): Promise<void> {
  const nextCompletedRequestIds = await drainWorkItemContextSyncQueueOnce({
    queuedRequests,
    completedRequestIds,
    readProjectTickets: () => input.projectTickets,
    ensureFullWorkItemContextBundle: async ({ ticket, request }) => {
      // The canonical request builder, not a third copy of it. Its `dedupeKey` is what makes the
      // PENDING attachment identifiable the moment it is enqueued: `buildPendingContextAttachment` is
      // called without the payload, so a request that omits the key produces a keyless entry, and a
      // keyless entry cannot be deduped. That is how this queue's attachment ended up beside the ticket
      // aside's auto-attached one for the same Epic.
      await input.addToChatFromRequest(
        buildTicketSidebarAddToChatRequest({
          backend: input.backend,
          project: input.project,
          projectId: input.project.id,
          ticket,
        }),
        { type: "thread", threadId: request.threadId },
      );
    },
  });

  completedRequestIds.clear();
  for (const requestId of nextCompletedRequestIds) {
    completedRequestIds.add(requestId);
  }

  for (let index = queuedRequests.length - 1; index >= 0; index -= 1) {
    if (completedRequestIds.has(queuedRequests[index]!.id)) {
      queuedRequests.splice(index, 1);
    }
  }
}
