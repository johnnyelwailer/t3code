import type { ProjectTicket } from "~/t3work/t3work-types";

export type WorkItemContextSyncQueueRequest = {
  readonly id: string;
  readonly projectId: string;
  readonly ticketKey: string;
};

export type WorkItemContextSyncQueueDrainInput = {
  readonly queuedRequests: ReadonlyArray<WorkItemContextSyncQueueRequest>;
  readonly completedRequestIds: ReadonlySet<string>;
  readonly readProjectTickets: () => ReadonlyArray<ProjectTicket>;
  readonly ensureFullWorkItemContextBundle: (input: {
    readonly projectId: string;
    readonly ticket: ProjectTicket;
  }) => Promise<void>;
};

function ticketMatchesKey(ticket: ProjectTicket, ticketKey: string): boolean {
  return (
    ticket.ref.displayId === ticketKey ||
    ticket.ref.id === ticketKey ||
    ticket.id === ticketKey
  );
}

export async function drainWorkItemContextSyncQueueOnce(
  input: WorkItemContextSyncQueueDrainInput,
): Promise<ReadonlySet<string>> {
  const completedRequestIds = new Set(input.completedRequestIds);

  for (const request of input.queuedRequests) {
    if (completedRequestIds.has(request.id)) continue;

    const ticket = input
      .readProjectTickets()
      .find((candidate) => ticketMatchesKey(candidate, request.ticketKey));
    if (!ticket) continue;

    await input.ensureFullWorkItemContextBundle({
      projectId: request.projectId,
      ticket,
    });
    completedRequestIds.add(request.id);
  }

  return completedRequestIds;
}
