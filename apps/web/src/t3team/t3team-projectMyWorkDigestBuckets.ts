import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

import type { DigestFacet, DigestPlacement } from "./t3team-projectMyWorkDigestTypes";

/** The heuristic producer's lanes, first match wins. */
type DigestBucket = {
  readonly id: string;
  readonly heading: string;
  readonly placement: DigestPlacement;
  readonly accepts: (
    facets: readonly DigestFacet[],
    ticket: ProjectTicket,
    nowMs: number,
  ) => boolean;
  readonly why?: (ticket: ProjectTicket, nowMs: number) => string;
  /** One line under a collapsed footer section, saying what it holds. */
  readonly hint?: string;
};

/** In progress but untouched this long, outside the current sprint, reads as gone quiet. */
const DIGEST_QUIET_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The server hands each ticket its sprint's effective state, so "active" is the sprint the
// viewer is in now, even when nobody pressed Start in Jira.
const inCurrentSprint = (ticket: ProjectTicket) => ticket.sprintState?.toLowerCase() === "active";
const isMoving = (ticket: ProjectTicket) => {
  const lane = getProjectTicketKanbanLane(ticket.status);
  return lane === "inProgress" || lane === "review";
};
const quietFor = (ticket: ProjectTicket, nowMs: number) => nowMs - Date.parse(ticket.updatedAt);

export const DIGEST_BUCKETS: readonly DigestBucket[] = [
  {
    id: "needs-you",
    heading: "Needs you",
    placement: "side",
    accepts: (f) => f.includes("decision"),
  },
  {
    id: "order",
    heading: "Priority",
    placement: "main",
    accepts: (f) => f.includes("claim") || f.includes("moved"),
  },
  {
    id: "stalled",
    heading: "Stalled agents",
    placement: "footer",
    accepts: (f) => f.includes("stalled"),
  },
  // The viewer's own board state, anchored on now: what is moving in this sprint or was touched
  // lately, then what the current sprint queues next. Old in-progress items and everything outside
  // the sprint fold into the footer instead of crowding out this week's work.
  {
    id: "in-progress",
    heading: "In progress",
    placement: "main",
    accepts: (_f, ticket, nowMs) =>
      isMoving(ticket) &&
      (inCurrentSprint(ticket) || quietFor(ticket, nowMs) <= DIGEST_QUIET_AFTER_MS),
  },
  {
    id: "up-next",
    heading: "Up next this sprint",
    placement: "main",
    accepts: (_f, ticket) => inCurrentSprint(ticket),
  },
  {
    id: "quiet",
    heading: "Gone quiet",
    placement: "footer",
    hint: "in progress, untouched for 2+ weeks, outside this sprint",
    accepts: (_f, ticket, nowMs) =>
      isMoving(ticket) &&
      !inCurrentSprint(ticket) &&
      quietFor(ticket, nowMs) > DIGEST_QUIET_AFTER_MS,
    why: (ticket, nowMs) =>
      `${ticket.status} · untouched ${Math.round(quietFor(ticket, nowMs) / DAY_MS)} d`,
  },
  // Open work outside any running or planned sprint (no sprint, rolled out of a closed one, a state
  // this code does not know) is still the viewer's work while it is fresh; stale, it folds below.
  {
    id: "your-tickets",
    heading: "Your tickets",
    placement: "main",
    accepts: (_f, ticket, nowMs) =>
      ticket.sprintState?.trim().toLowerCase() !== "future" &&
      quietFor(ticket, nowMs) <= DIGEST_QUIET_AFTER_MS,
  },
  {
    id: "rest",
    heading: "Parked",
    placement: "footer",
    hint: "planned for a later sprint, or untouched for 2+ weeks",
    accepts: () => true,
  },
];
