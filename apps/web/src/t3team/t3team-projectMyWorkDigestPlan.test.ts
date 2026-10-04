import { describe, expect, it } from "vite-plus/test";

import { buildHeuristicDigestPlan, type DigestGraph } from "./t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "./t3team-types";

function ticket(id: string, status: string, sprintState?: string): ProjectTicket {
  return {
    id,
    projectId: "p1",
    title: id,
    status,
    assignee: "Philip",
    updatedAt: "2026-09-20T08:00:00.000Z",
    ...(sprintState !== undefined ? { sprintState } : {}),
  } as unknown as ProjectTicket;
}

function graph(tickets: readonly ProjectTicket[]): DigestGraph {
  return {
    scope: "project",
    projects: [{ id: "p1", name: "P" }],
    viewer: { name: "Philip", role: "", lastVisitAt: "2026-09-29T00:00:00.000Z" },
    tickets,
    claims: [],
    decisions: [],
    changeRequests: [],
    transitions: [],
    blockers: [],
  };
}

describe("heuristic digest plan", () => {
  it("lanes the viewer's own board state instead of parking everything without agent activity", () => {
    const plan = buildHeuristicDigestPlan(
      graph([
        ticket("doing", "In Progress", "active"),
        ticket("reviewing", "In Review", "active"),
        ticket("next", "To Do", "active"),
        ticket("later", "To Do"),
        ticket("finished", "Done", "active"),
      ]),
      Date.parse("2026-09-30T08:00:00.000Z"),
    );
    expect(
      plan.sections.map((section) => [
        section.id,
        section.placement,
        section.items.map((item) => item.ticketId),
      ]),
    ).toEqual([
      ["in-progress", "main", ["doing", "reviewing"]],
      ["up-next", "main", ["next"]],
      ["rest", "footer", ["later"]],
    ]);
  });
});
