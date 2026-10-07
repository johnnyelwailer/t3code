import type { ProjectTicket, ProjectThread } from "~/t3team/t3team-types";

export function buildProjectTicketLookup(
  tickets: ReadonlyArray<ProjectTicket>,
): ReadonlyMap<string, ProjectTicket> {
  const lookup = new Map<string, ProjectTicket>();

  for (const ticket of tickets) {
    for (const candidate of [ticket.id, ticket.ref.id, ticket.ref.displayId]) {
      if (candidate) {
        lookup.set(candidate, ticket);
      }
    }
  }

  return lookup;
}

export function resolveCanonicalProjectTicketId(
  ticketId: string | undefined,
  ticketLookup?: ReadonlyMap<string, ProjectTicket>,
): string | undefined {
  if (!ticketId) {
    return undefined;
  }

  return ticketLookup?.get(ticketId)?.id ?? ticketId;
}

export function matchesProjectThreadTicket(
  thread: Pick<ProjectThread, "ticketId" | "ticketDisplayId">,
  ticketId: string,
  ticketDisplayId?: string,
): boolean {
  const aliases = [ticketId, ticketDisplayId].filter((candidate): candidate is string =>
    Boolean(candidate),
  );

  return aliases.some(
    (candidate) => candidate === thread.ticketId || candidate === thread.ticketDisplayId,
  );
}

/**
 * The ticket's live thread: its newest thread that is not settled, if any. A ticket shown beside
 * My Work uses it as its chat, the way the ticket page uses its embedded thread.
 */
export function latestLiveTicketThreadId(
  threads: ReadonlyArray<
    Pick<ProjectThread, "id" | "ticketId" | "ticketDisplayId" | "createdAt" | "settled">
  >,
  ticketId: string,
): string | undefined {
  return threads
    .filter((thread) => thread.settled !== true && matchesProjectThreadTicket(thread, ticketId))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.id;
}
