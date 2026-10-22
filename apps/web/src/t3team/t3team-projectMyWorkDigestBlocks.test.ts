import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { isDigestBlockLive } from "./t3team-projectMyWorkDigestBlocks";
import type {
  DigestChangeRequest,
  DigestDependency,
  DigestGraph,
} from "./t3team-projectMyWorkDigestPlan";

const graph = (status: string, prStates: DigestChangeRequest["state"][] = []): DigestGraph => ({
  scope: "project",
  projects: [],
  viewer: { name: "Viewer", role: "", lastVisitAt: "2026-03-09T00:00:00.000Z" },
  tickets: [createTicket({ id: "mine", status, ref: { displayId: "ACME-1" } })],
  claims: [],
  decisions: [],
  changeRequests: prStates.map(
    (state, index) =>
      ({
        id: `pr-${index}`,
        ticketId: "mine",
        repo: "acme/w",
        number: index,
        state,
        reviewers: [],
        updatedAt: "",
      }) as DigestChangeRequest,
  ),
  transitions: [],
  blockers: [],
});

const waitsOnMe = (otherStatus = "To Do"): DigestDependency => ({
  ticketId: "mine",
  relation: "waits-on-you",
  other: { key: "ACME-9", title: "Downstream", status: otherStatus },
});
const iWaitOn = (status: string): DigestDependency => ({
  ticketId: "mine",
  relation: "you-wait-on",
  other: { key: "ACME-8", title: "Upstream", status },
});

describe("isDigestBlockLive", () => {
  it("counts the viewer's block while their ticket is in development and not all merged", () => {
    expect(isDigestBlockLive(graph("In Progress"), waitsOnMe())).toBe(true);
    expect(isDigestBlockLive(graph("In Progress", ["merged", "open"]), waitsOnMe())).toBe(true);
  });

  it("drops it once the viewer's ticket is in review or test, or all its PRs merged", () => {
    expect(isDigestBlockLive(graph("In Test"), waitsOnMe())).toBe(false);
    expect(isDigestBlockLive(graph("Code Review"), waitsOnMe())).toBe(false);
    expect(isDigestBlockLive(graph("In Progress", ["merged", "merged"]), waitsOnMe())).toBe(false);
  });

  it("drops a block on a ticket that is done", () => {
    expect(isDigestBlockLive(graph("In Progress"), waitsOnMe("Done"))).toBe(false);
  });

  it("counts a block on the viewer only while the blocker is in development", () => {
    expect(isDigestBlockLive(graph("To Do"), iWaitOn("In Progress"))).toBe(true);
    expect(isDigestBlockLive(graph("To Do"), iWaitOn("In Test"))).toBe(false);
    expect(isDigestBlockLive(graph("To Do"), iWaitOn("Done"))).toBe(false);
  });

  it("never counts a same-story link as a block", () => {
    expect(isDigestBlockLive(graph("To Do"), { ...iWaitOn("To Do"), relation: "same-story" })).toBe(
      false,
    );
  });
});
