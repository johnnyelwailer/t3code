import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestTypes";

/** A digest row's ticket, with the key and summary the row showed when the graph knows them. */
export type DigestSelectedTicket = {
  readonly ticketId: string;
  readonly displayId?: string;
  readonly title?: string;
};

export function digestSelectedTicket(
  graph: DigestGraph | null,
  ticketId: string,
): DigestSelectedTicket {
  const ticket = graph?.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) return { ticketId };
  return { ticketId, displayId: ticket.ref.displayId, title: ticket.ref.title };
}
