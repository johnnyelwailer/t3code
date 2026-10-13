import { describe, expect, it } from "vite-plus/test";

import { digestStructureKey } from "~/t3team/t3team-digestStructureKey";
import {
  DIGEST_FIXTURE_NOW_MS,
  digestFixtureGraph,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import { buildDigestPlan, type DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

const keyOf = (graph: DigestGraph, noticeShown = false) =>
  digestStructureKey({ plan: buildDigestPlan(graph, DIGEST_FIXTURE_NOW_MS), graph, noticeShown });

const placedTicketIds = (graph: DigestGraph) =>
  buildDigestPlan(graph, DIGEST_FIXTURE_NOW_MS).sections.flatMap((section) =>
    section.items.map((item) => item.ticketId),
  );

describe("digestStructureKey", () => {
  it("does not move when only words and numbers change", () => {
    const retitled: DigestGraph = {
      ...digestFixtureGraph,
      jiraSyncedAt: "2026-09-14T09:00:00.000Z",
      tickets: digestFixtureGraph.tickets.map((ticket) => ({
        ...ticket,
        ref: { ...ticket.ref, title: `${ticket.ref.title}, reworded` },
      })),
    };

    expect(keyOf(retitled)).toBe(keyOf(digestFixtureGraph));
  });

  it("moves when a ticket leaves the digest", () => {
    const leaving = placedTicketIds(digestFixtureGraph)[0];
    const withoutIt: DigestGraph = {
      ...digestFixtureGraph,
      tickets: digestFixtureGraph.tickets.filter((ticket) => ticket.id !== leaving),
    };

    expect(keyOf(withoutIt)).not.toBe(keyOf(digestFixtureGraph));
  });

  it("moves when a ticket changes section", () => {
    const plan = buildDigestPlan(digestFixtureGraph, DIGEST_FIXTURE_NOW_MS);
    const quiet = plan.sections.find((section) => section.id !== "needs-you" && section.items[0]);
    const ticketId = quiet?.items[0]?.ticketId;
    if (ticketId === undefined) throw new Error("The fixture has no ticket outside Needs you.");
    const decided: DigestGraph = {
      ...digestFixtureGraph,
      decisions: [
        {
          id: "decision-1",
          ticketId,
          threadId: "thread-1",
          question: "Ship it?",
          requiredRole: "",
          askedAt: "2026-09-14T08:00:00.000Z",
        },
      ],
    };

    expect(keyOf(decided)).not.toBe(keyOf(digestFixtureGraph));
  });

  it("moves when a notice appears above the lanes", () => {
    expect(keyOf(digestFixtureGraph, true)).not.toBe(keyOf(digestFixtureGraph, false));
  });
});
