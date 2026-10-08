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
    const { groupByParent } = await import("./t3team-projectMyWorkDigestGroups");
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

  it("keeps a story's PRs off its header when another section shows the story as a row", async () => {
    const { digestRowTicketIds, groupByParent } =
      await import("./t3team-projectMyWorkDigestGroups");
    const withRef = (id: string, parentId?: string) =>
      ({
        ...ticket(id, "In Progress", "active"),
        ref: { displayId: id, title: id, type: "Task", url: "" },
        ...(parentId !== undefined ? { parentId } : {}),
      }) as unknown as ProjectTicket;
    const tickets = [withRef("STORY"), withRef("TASK", "STORY")];
    const g = graph(tickets);
    const byId = new Map(tickets.map((t) => [t.id, t]));
    const section = (id: string, items: string[]) =>
      ({
        id,
        kind: "items",
        placement: "main",
        heading: id,
        items: items.map((ticketId) => ({ ticketId })),
      }) as const;
    // Story heads its own card: the row is folded into the header, which keeps the PRs.
    const together = section("in-progress", ["STORY", "TASK"]);
    const alone = groupByParent(together, g, byId, new Set(), digestRowTicketIds([together], g));
    expect(alone.map((group) => [group.parent?.id, group.showStoryPrs])).toEqual([["STORY", true]]);
    // Story is a row in "review", its task heads a card in "in-progress": the row has the PRs.
    const review = section("review", ["STORY"]);
    const work = section("in-progress", ["TASK"]);
    const rows = digestRowTicketIds([review, work], g);
    expect([...rows].toSorted()).toEqual(["STORY", "TASK"]);
    const split = groupByParent(work, g, byId, new Set(), rows);
    expect(split.map((group) => [group.parent?.id, group.showStoryPrs])).toEqual([
      ["STORY", false],
    ]);
  });
});
