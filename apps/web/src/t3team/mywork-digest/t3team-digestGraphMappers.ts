/**
 * Raw digest payload → the web `DigestGraph` contract.
 *
 * The one place that joins the server's ticket refs to the ticket objects the
 * UI already knows (`resourceRefToProjectTicket`), and re-joins claims,
 * decisions, change requests, and transitions back to ticket ids by issue id
 * or Jira key. Everything is derived here once; the view layer memoizes over
 * the returned graph.
 */

import type { ProjectShellProject } from "@t3tools/project-context";

import type {
  MyWorkDigestPayload,
  MyWorkDigestProjectInput,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { resourceRefToProjectTicket } from "~/t3team/t3team-ticketMappers";
import type {
  DigestClaim,
  DigestChangeRequest,
  DigestDecision,
  DigestGraph,
  DigestSprint,
  DigestTransition,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type DigestViewer = {
  readonly name: string;
  readonly role: string;
  readonly lastVisitAt: string;
};

type TicketIndex = Map<string, string>;

function buildTicketIndex(
  tickets: readonly ProjectTicket[],
  ids: ReadonlyArray<string>,
): TicketIndex {
  const index: TicketIndex = new Map();
  tickets.forEach((ticket, position) => {
    const refId = ids[position];
    if (refId !== undefined) index.set(refId.toUpperCase(), ticket.id);
    const key = ticket.ref.displayId.toUpperCase();
    if (key !== "") index.set(key, ticket.id);
  });
  return index;
}

/** Split a Jira sprint goal (one string, possibly bulleted) into goal lines. */
export function digestSprintGoals(goal: string | undefined): readonly string[] {
  if (goal === undefined) return [];
  return goal
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\s]+/, "").trim())
    .filter((line) => line !== "");
}

/**
 * Joins one server payload into the `DigestGraph` the views consume.
 * `projects` and `entries` are the request's project list in order — the
 * server answers one section per entry, in the same order.
 */
export function payloadToDigestGraph(input: {
  readonly payload: MyWorkDigestPayload;
  readonly projects: ReadonlyArray<ProjectShellProject>;
  readonly entries: ReadonlyArray<MyWorkDigestProjectInput>;
  readonly viewer: DigestViewer;
}): DigestGraph {
  const allTickets: ProjectTicket[] = [];
  const indexByProject: Array<{ index: TicketIndex }> = [];
  let sprint: DigestSprint | undefined;

  input.payload.projects.forEach((data, position) => {
    const entry = input.entries[position];
    const project = input.projects[position];
    if (entry === undefined || project === undefined) return;

    const tickets = data.tickets.map((ref) =>
      resourceRefToProjectTicket(
        project.id,
        ref as unknown as Parameters<typeof resourceRefToProjectTicket>[1],
        entry.account.id,
      ),
    );
    allTickets.push(...tickets);
    indexByProject.push({
      index: buildTicketIndex(
        tickets,
        data.tickets.map((ref) => ref.id),
      ),
    });
    // The digest header wears the FIRST project's sprint; in "all" scope the
    // view hides the sprint row entirely (the contract carries one sprint).
    if (sprint === undefined && data.sprint !== undefined) {
      const now = new Date().toISOString();
      sprint = {
        name: data.sprint.name,
        goal: digestSprintGoals(data.sprint.goal),
        startDate: data.sprint.startDate ?? now,
        endDate: data.sprint.endDate ?? now,
      };
    }
  });

  const resolveTicketId = (
    position: number,
    ref: { readonly issueId?: string; readonly issueKey?: string },
  ): string => {
    const index = indexByProject[position]?.index;
    if (index === undefined) return "";
    if (ref.issueId !== undefined) {
      const byId = index.get(ref.issueId.toUpperCase());
      if (byId !== undefined) return byId;
    }
    if (ref.issueKey !== undefined) {
      const byKey = index.get(ref.issueKey.toUpperCase());
      if (byKey !== undefined) return byKey;
    }
    return "";
  };

  const claims: DigestClaim[] = [];
  const decisions: DigestDecision[] = [];
  const changeRequests: DigestChangeRequest[] = [];
  const transitions: DigestTransition[] = [];

  input.payload.projects.forEach((data, position) => {
    for (const claim of data.claims) {
      const ticketId = resolveTicketId(position, claim.ticketRef);
      if (ticketId === "") continue;
      claims.push({
        threadId: claim.threadId,
        threadTitle: claim.threadTitle,
        ticketId,
        agent: claim.agent,
        lastActivityAt: claim.lastActivityAt,
      });
    }
    for (const decision of data.decisions) {
      const ticketId = resolveTicketId(position, decision.ticketRef);
      if (ticketId === "") continue;
      decisions.push({
        id: decision.id,
        ticketId,
        threadId: decision.threadId,
        question: decision.question,
        // TODO(digest): requiredRole has no server source yet — empty for now.
        requiredRole: "",
        askedAt: decision.askedAt,
      });
    }
    for (const pr of data.changeRequests) {
      if (pr.workItemKey === undefined) continue;
      const ticketId = resolveTicketId(position, { issueKey: pr.workItemKey });
      if (ticketId === "") continue;
      changeRequests.push({
        id: pr.id,
        ticketId,
        repo: pr.repo,
        number: pr.number,
        state: pr.state,
        updatedAt: pr.updatedAt,
      });
    }
    for (const transition of data.transitions) {
      const ticketId = resolveTicketId(position, transition.ticketRef);
      if (ticketId === "") continue;
      transitions.push({
        ticketId,
        from: transition.from,
        to: transition.to,
        at: transition.at,
      });
    }
  });

  return {
    scope: input.payload.scope,
    projects: input.payload.projects.map((data) => data.project),
    viewer: input.viewer,
    ...(sprint !== undefined ? { sprint } : {}),
    tickets: allTickets,
    claims,
    decisions,
    changeRequests,
    transitions,
  };
}
