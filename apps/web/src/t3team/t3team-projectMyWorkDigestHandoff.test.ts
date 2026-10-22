import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import {
  digestHandoffSections,
  digestOpenWorkLine,
  isDigestTicketHandedOff,
} from "./t3team-projectMyWorkDigestHandoff";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
  type DigestChangeRequest,
  type DigestGraph,
} from "./t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "./t3team-types";

const NOW = Date.parse("2026-03-10T08:00:00.000Z");

const ticket = (key: string, status: string, extra: Partial<ProjectTicket> = {}) =>
  createTicket({
    id: key,
    status,
    assignee: "Viewer",
    updatedAt: "2026-03-09T08:00:00.000Z",
    sprintState: "active",
    ref: { displayId: key, title: `${key} widget` },
    ...extra,
  });

const pr = (ticketId: string, number: number, state: DigestChangeRequest["state"]) =>
  ({
    id: `acme/widgets#${number}`,
    ticketId,
    repo: "acme/widgets",
    number,
    state,
    reviewers: [],
    updatedAt: "2026-03-09T08:00:00.000Z",
  }) as DigestChangeRequest;

const graph = (tickets: ProjectTicket[], extra: Partial<DigestGraph> = {}): DigestGraph => ({
  scope: "project",
  projects: [{ id: "project-1", name: "Acme" }],
  viewer: { name: "Viewer", role: "", lastVisitAt: "2026-03-09T00:00:00.000Z" },
  tickets,
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
  ...extra,
});

const lanes = (g: DigestGraph) =>
  buildHeuristicDigestPlan(g, NOW).sections.map((s) => [
    s.id,
    s.placement,
    s.items.map((i) => [i.ticketId, i.why ?? "", i.compact === true]),
  ]);

describe("handed-off tickets", () => {
  it("drop out of the working lanes when nothing of the viewer's is open on them", () => {
    const g = graph([ticket("ACME-1", "In Progress"), ticket("ACME-2", "In Test")]);
    expect(lanes(g)).toEqual([
      ["in-progress", "main", [["ACME-1", "", false]]],
      ["handed-off", "footer", [["ACME-2", "", false]]],
    ]);
  });

  it("become one compact line when the viewer still has a PR open on them", () => {
    const g = graph([ticket("ACME-2", "In Test")], {
      changeRequests: [pr("ACME-2", 7, "draft"), pr("ACME-2", 3, "merged")],
    });
    expect(lanes(g)).toEqual([
      ["handed-off-open", "side", [["ACME-2", "draft PR open · acme/widgets#7", true]]],
    ]);
  });

  it("count an open subtask of the viewer's as open work, but not a merged PR", () => {
    const story = ticket("ACME-5", "Code Review");
    const subtask = ticket("ACME-6", "In Progress", {
      parentId: "ACME-5",
      issueTypeIsSubtask: true,
    });
    const someoneElses = ticket("ACME-7", "To Do", { parentId: "ACME-5", assignee: "Other" });
    const g = graph([story, subtask, someoneElses], {
      changeRequests: [pr("ACME-5", 9, "merged")],
    });
    expect(digestOpenWorkLine(g, story)).toBe("open subtask ACME-6");
    expect(
      digestOpenWorkLine(graph([story], { changeRequests: [pr("ACME-5", 9, "merged")] }), story),
    ).toBeUndefined();
  });

  it("stay in Needs you while they wait on a decision", () => {
    const g = graph([ticket("ACME-3", "In Test")], {
      decisions: [{ ticketId: "ACME-3" } as unknown as DigestGraph["decisions"][number]],
    });
    expect(isDigestTicketHandedOff(g, g.tickets[0]!)).toBe(false);
    expect(lanes(g).map(([id]) => id)).toEqual(["needs-you"]);
  });

  it("leave an agent arrangement's working sections for the handed-off lanes", () => {
    const g = graph([ticket("ACME-1", "In Progress"), ticket("ACME-2", "In Test")], {
      changeRequests: [pr("ACME-2", 7, "open")],
    });
    const plan = resolveDigestPlan(
      {
        producer: "agent",
        producedAt: "2026-03-09T08:00:00.000Z",
        sections: [
          {
            id: "focus",
            kind: "items",
            placement: "main",
            heading: "Focus",
            items: [{ ticketId: "ACME-1" }, { ticketId: "ACME-2" }],
          },
        ],
      },
      g,
      NOW,
    );
    expect(plan.sections.map((s) => [s.id, s.heading, s.items.map((i) => i.ticketId)])).toEqual([
      ["focus", "Focus", ["ACME-1"]],
      ["handed-off-open", "Handed off", ["ACME-2"]],
    ]);
    expect(plan.newSinceTicketIds).toEqual([]);
  });

  it("build no lane for an empty list", () => {
    expect(digestHandoffSections(graph([]), [])).toEqual([]);
  });
});
