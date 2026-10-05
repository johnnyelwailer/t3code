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

describe("heuristic digest plan, anchored on now", () => {
  it("folds old in-progress work and out-of-sprint items under the sprint's own work", () => {
    const now = Date.parse("2026-10-05T08:00:00.000Z");
    const aged = (t: ProjectTicket, updatedAt: string) => ({ ...t, updatedAt }) as ProjectTicket;
    const plan = buildHeuristicDigestPlan(
      graph([
        aged(ticket("sprint-old", "In Progress", "active"), "2026-08-14T08:00:00.000Z"),
        aged(ticket("fresh", "Code Review"), "2026-09-29T08:00:00.000Z"),
        aged(ticket("stale", "In Progress"), "2026-08-12T08:00:00.000Z"),
        aged(ticket("backlog", "To Do", "future"), "2026-09-03T08:00:00.000Z"),
      ]),
      now,
    );
    expect(
      plan.sections.map((section) => [
        section.id,
        section.items.map((item) => [item.ticketId, item.why ?? ""]),
      ]),
    ).toEqual([
      [
        "in-progress",
        [
          ["fresh", ""],
          ["sprint-old", ""],
        ],
      ],
      ["quiet", [["stale", "In Progress · untouched 54 d"]]],
      ["rest", [["backlog", ""]]],
    ]);
  });
});

describe("digest story groups", () => {
  it("shows a story that is itself in the section once, as its group's header", async () => {
    const { groupByParent } = await import("./t3team-ProjectMyWorkDigestSections");
    const withRef = (id: string, parentId?: string) =>
      ({
        ...ticket(id, "In Progress", "active"),
        ref: { displayId: id, title: id, type: "Task", url: "" },
        ...(parentId !== undefined ? { parentId } : {}),
      }) as unknown as ProjectTicket;
    const tickets = [withRef("EPIC"), withRef("STORY", "EPIC"), withRef("TASK", "STORY")];
    const g = graph(tickets);
    const groups = groupByParent(
      {
        id: "in-progress",
        kind: "items",
        placement: "main",
        heading: "In progress",
        items: [{ ticketId: "STORY" }, { ticketId: "TASK" }],
      },
      g,
      new Map(tickets.map((t) => [t.id, t])),
    );
    expect(groups.map((group) => [group.parent?.id, group.items.map((i) => i.ticketId)])).toEqual([
      ["STORY", ["TASK"]],
    ]);
  });
});
