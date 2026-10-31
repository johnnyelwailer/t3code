import { describe, expect, it } from "vite-plus/test";

import { buildDigestPlan, type DigestGraph } from "./t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "./t3team-types";
import {
  buildViewContext,
  digestVisibleTicketIds,
  selectionFromAside,
} from "./t3team-viewContextBuild";

const view = { surface: "my-work", projectId: "p1", filters: { query: "q" } } as const;

describe("buildViewContext", () => {
  it("builds the context for the reporting project, with the true count past the id cap", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const context = buildViewContext({
      projectId: "p1",
      view,
      items: { projectId: "p1", ids },
      selection: selectionFromAside({ ticketId: "t-9" }, null),
    });
    expect(context).toMatchObject({
      version: 1,
      surface: "my-work",
      selection: { kind: "work-item", id: "t-9" },
      visibleItemCount: 250,
    });
    expect(context?.visibleItemIds).toHaveLength(200);
  });

  it("reports nothing for another project's view, and never another project's items", () => {
    expect(buildViewContext({ projectId: "p2", view, items: null, selection: null })).toBeNull();
    expect(
      buildViewContext({
        projectId: "p1",
        view,
        items: { projectId: "p2", ids: ["x"] },
        selection: null,
      }),
    ).toMatchObject({ visibleItemIds: [], visibleItemCount: 0 });
  });

  it("names a pull request selection with the neutral change-request kind", () => {
    expect(selectionFromAside(null, { repository: "acme/web", number: 7 })).toEqual({
      kind: "change-request",
      id: "acme/web#7",
    });
    expect(selectionFromAside(null, null)).toBeNull();
  });
});

function ticket(id: string, status: string, assignee = "Philip"): ProjectTicket {
  return {
    id,
    projectId: "p1",
    title: id,
    ref: { displayId: id, title: id, url: "" },
    status,
    assignee,
    updatedAt: "2026-09-20T08:00:00.000Z",
    sprintState: "active",
  } as unknown as ProjectTicket;
}

describe("digestVisibleTicketIds", () => {
  it("lists the resolved plan's rows in lane order and leaves out done and other people's tickets", () => {
    const graph: DigestGraph = {
      scope: "project",
      projects: [{ id: "p1", name: "P" }],
      viewer: { name: "Philip", role: "", lastVisitAt: "2026-09-29T00:00:00.000Z" },
      tickets: [
        ticket("next", "To Do"),
        ticket("finished", "Done"),
        ticket("theirs", "In Progress", "Dana"),
        ticket("doing", "In Progress"),
        ticket("reviewing", "In Review"),
      ],
      claims: [],
      decisions: [],
      changeRequests: [],
      transitions: [],
      blockers: [],
    };
    const plan = buildDigestPlan(graph, Date.parse("2026-09-30T08:00:00.000Z"));
    const ids = digestVisibleTicketIds(plan);
    expect(ids).toEqual(["doing", "next", "reviewing"]);
    expect(ids).not.toContain("finished");
    expect(ids).not.toContain("theirs");
  });
});
