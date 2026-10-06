/**
 * Raw digest payload → the web `DigestGraph` contract.
 *
 * The one place that joins the server's ticket refs to the ticket objects the
 * UI already knows (`resourceRefToProjectTicket`) and re-joins claims, decisions,
 * change requests, and transitions back to ticket ids. Derived here once;
 * the view layer memoizes over the returned graph.
 */

import { withSharedFaces } from "./t3team-digestPeopleFaces";
import type { ProjectShellProject } from "@t3tools/project-context";

import type {
  MyWorkDigestPayload,
  MyWorkDigestProjectInput,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { resourceRefToProjectTicket } from "~/t3team/t3team-ticketMappers";
import {
  digestDependencies,
  digestReviewRequests,
  digestTicketChangeRequests,
} from "./t3team-digestGraphPrJoins";
import type {
  DigestBlocker,
  DigestClaim,
  DigestDecision,
  DigestGraph,
  DigestSprint,
  DigestTransition,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { digestYesterday } from "./t3team-digestGraphYesterday";
import {
  buildTicketIndex,
  digestSprintGoals,
  oldestJiraSync,
  resolveIndexedTicketId,
  type DigestTicketRefLike,
  type TicketIndex,
} from "./t3team-digestGraphHelpers";

export type DigestViewer = {
  readonly name: string;
  readonly role: string;
  readonly lastVisitAt: string;
};

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

  // The server answers one section per request entry, in order; the app project behind an
  // entry is looked up by id (`appProjectId`), never by position, so a filtered project list
  // cannot shift a section onto the wrong project.
  const projectForEntry = (entry: MyWorkDigestProjectInput | undefined) =>
    entry === undefined
      ? undefined
      : input.projects.find((project) => project.id === entry.appProjectId);

  input.payload.projects.forEach((data, position) => {
    const entry = input.entries[position];
    const project = projectForEntry(entry);
    if (entry === undefined || project === undefined) {
      // Keep the per-position index aligned with the payload so later joins stay on their section.
      indexByProject.push({ index: new Map() });
      return;
    }

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
      // Missing dates collapse to one instant (`start === end`); `digestSprintProgress` reads
      // that as "unknown" and the header hides its progress row.
      sprint = {
        name: data.sprint.name,
        ...(data.sprint.state !== undefined ? { state: data.sprint.state } : {}),
        goal: digestSprintGoals(data.sprint.goal),
        startDate: data.sprint.startDate ?? now,
        endDate: data.sprint.endDate ?? now,
      };
    }
  });

  const resolveTicketId = (position: number, ref: DigestTicketRefLike): string =>
    resolveIndexedTicketId(indexByProject[position]?.index, ref);

  const claims: DigestClaim[] = [];
  const decisions: DigestDecision[] = [];
  const blockers: DigestBlocker[] = [];
  const transitions: DigestTransition[] = [];
  let burndown: DigestGraph["burndown"];

  const lastVisitMs = Date.parse(input.viewer.lastVisitAt);

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
    for (const blocker of data.blockers ?? []) {
      const ticketId = resolveTicketId(position, blocker.ticketRef);
      if (ticketId === "") continue;
      blockers.push({ ticketId, repo: blocker.repo, number: blocker.number });
    }
    if (burndown === undefined && data.burndown !== undefined) {
      burndown = { ...data.burndown, points: [...data.burndown.points] };
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

  // Tickets carry the APP project id (`resourceRefToProjectTicket(project.id, …)`), so the
  // graph's project list must be keyed the same way — the server's entry is keyed by the Jira
  // project key, and a chip looking that up by app id would fall back to printing the raw uuid.
  const projects = input.payload.projects.map((data, position) => {
    const entry = input.entries[position];
    const project = projectForEntry(entry);
    const id = project?.id ?? entry?.appProjectId ?? data.project.id;
    const title = project?.title.trim() ?? entry?.name?.trim() ?? "";
    return { id, name: title !== "" ? title : data.project.name };
  });

  const jiraSyncedAt = oldestJiraSync(input.payload.projects);
  const projectIdAt = (at: number) => projects[at]?.id ?? "";
  const joins = [input.payload.projects, resolveTicketId] as const;
  const changeRequests = digestTicketChangeRequests(...joins, projectIdAt, lastVisitMs);
  const reviewRequests = digestReviewRequests(...joins, projectIdAt);
  const dependencies = digestDependencies(...joins);
  const yesterday = digestYesterday(...joins, projectIdAt);
  return withSharedFaces({
    scope: input.payload.scope,
    projects,
    ...(jiraSyncedAt !== undefined ? { jiraSyncedAt } : {}),
    viewer: input.viewer,
    ...(sprint !== undefined ? { sprint } : {}),
    ...(burndown !== undefined ? { burndown } : {}),
    tickets: allTickets,
    claims,
    decisions,
    changeRequests,
    reviewRequests,
    dependencies,
    ...(yesterday !== undefined ? { yesterday } : {}),
    ...(input.payload.arrangement !== undefined ? { arrangement: input.payload.arrangement } : {}),
    transitions,
    blockers,
  });
}
