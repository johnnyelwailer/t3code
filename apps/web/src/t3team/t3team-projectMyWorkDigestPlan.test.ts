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
        ticket("later", "To Do", "future"),
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
      // Intentional: only work planned into a future sprint is "Parked" now. Before "Your
      // tickets" existed, a sprint-less "To Do" ticket landed here too (see the next test).
      ["rest", "footer", ["later"]],
    ]);
  });

  it("surfaces the viewer's open sprint-less tickets in 'Your tickets' instead of 'Parked'", () => {
    const plan = buildHeuristicDigestPlan(
      graph([
        ticket("analysis", "In Analysis"),
        ticket("rolled-over", "To Do", "closed"),
        ticket("planned", "To Do", "future"),
        ticket("odd-state", "To Do", "suspended"),
        { ...ticket("someone-else", "In Analysis"), assignee: "Dana" },
      ]),
      Date.parse("2026-09-30T08:00:00.000Z"),
    );
    expect(
      plan.sections.map((section) => [
        section.id,
        section.heading,
        section.placement,
        section.items.map((item) => item.ticketId),
      ]),
    ).toEqual([
      // An unknown sprint state must not hide the viewer's work; only "future" parks it.
      ["your-tickets", "Your tickets", "main", ["analysis", "rolled-over", "odd-state"]],
      ["rest", "Parked", "footer", ["planned"]],
    ]);
  });

  it("keeps decisions in 'Needs you' ahead of the new bucket", () => {
    const base = graph([ticket("decide", "In Analysis"), ticket("plain", "In Analysis")]);
    const plan = buildHeuristicDigestPlan(
      {
        ...base,
        decisions: [{ ticketId: "decide" } as unknown as DigestGraph["decisions"][number]],
      },
      Date.parse("2026-09-30T08:00:00.000Z"),
    );
    expect(
      plan.sections.map((section) => [section.id, section.items.map((i) => i.ticketId)]),
    ).toEqual([
      ["needs-you", ["decide"]],
      ["your-tickets", ["plain"]],
    ]);
  });
});
