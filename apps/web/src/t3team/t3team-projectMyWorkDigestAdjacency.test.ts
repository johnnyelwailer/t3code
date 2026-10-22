import { describe, expect, it } from "vite-plus/test";

import {
  DIGEST_ADJACENT_PILL_LIMIT,
  digestFoldedSummary,
  digestQuietSummary,
  digestStoryAdjacency,
} from "~/t3team/t3team-projectMyWorkDigestAdjacency";
import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import type { DigestDependency } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

const ticket = (key: string, status: string, assignee?: string): ProjectTicket =>
  createTicket({
    id: `id-${key}`,
    status,
    parentId: "id-STORY",
    ...(assignee ? { assignee } : {}),
    ref: { displayId: key, title: `${key} title` },
  });

// The product owner's real card: IES-19503 → his IES-24571 in Code Review, three siblings.
const mine = ticket("IES-24571", "Code Review", "Philip");
const siblings = [
  ticket("IES-23579", "To Do", "Angie"),
  ticket("IES-20097", "In Progress", "Philip"),
  ticket("IES-21699", "Done", "Benjamin"),
];

const adjacency = (dependencies: readonly DigestDependency[] = [], extra: ProjectTicket[] = []) =>
  digestStoryAdjacency({
    rowIds: new Set([mine.id]),
    siblings: [...siblings, ...extra],
    dependencies,
    hiddenKeys: new Set([mine.ref.displayId]),
    ticketsById: new Map([mine, ...siblings, ...extra].map((t) => [t.id, t])),
    viewerName: "Philip",
  });

const keys = (items: readonly { key: string }[]) => items.map((item) => item.key);

describe("digestStoryAdjacency", () => {
  it("keeps active siblings as pills and folds Done and others' To Do into the count", () => {
    const { active, quiet } = adjacency();
    expect(keys(active)).toEqual(["IES-20097"]);
    expect(keys(quiet)).toEqual(["IES-23579", "IES-21699"]);
    expect(digestQuietSummary(quiet)).toBe("1 done · 1 to do");
  });

  it("keeps the viewer's own To Do sibling active, but an unassigned one quiet", () => {
    const { active, quiet } = adjacency(
      [],
      [ticket("IES-1", "To Do", " philip "), ticket("IES-2", "To Do")],
    );
    expect(keys(active)).toContain("IES-1");
    expect(keys(quiet)).toContain("IES-2");
  });

  it("ranks blocks on the viewer first, then blocks by the viewer, then siblings by lane", () => {
    const { active } = adjacency(
      [
        {
          ticketId: mine.id,
          relation: "waits-on-you",
          other: { key: "IES-900", title: "Downstream", status: "To Do", assignee: "Sandra" },
        },
        {
          ticketId: mine.id,
          relation: "you-wait-on",
          other: { key: "IES-800", title: "Upstream API", status: "In Progress" },
        },
      ],
      [ticket("IES-3", "In Review", "Sandra")],
    );
    expect(active.map((item) => [item.key, item.relation])).toEqual([
      ["IES-800", "blocks-you"],
      ["IES-900", "waits-on-you"],
      ["IES-20097", "sibling"],
      ["IES-3", "sibling"],
    ]);
    expect(active[0]?.viewerTicketKey).toBe("IES-24571");
  });

  it("lets a block win over the same ticket as a sibling, and drops a Done block to the count", () => {
    const { active, quiet } = adjacency([
      {
        ticketId: mine.id,
        relation: "you-wait-on",
        other: { key: "IES-20097", title: "x", status: "In Progress", assignee: "Philip" },
      },
      {
        ticketId: mine.id,
        relation: "you-wait-on",
        other: { key: "IES-801", title: "Resolved", status: "Done" },
      },
    ]);
    expect(active.map((item) => [item.key, item.relation, item.ticketId])).toEqual([
      ["IES-20097", "blocks-you", "id-IES-20097"],
    ]);
    expect(keys(quiet)).toContain("IES-801");
  });

  it("adds same-story links the ticket list lacks, skips ones on screen, ignores other rows", () => {
    const { active } = adjacency([
      {
        ticketId: mine.id,
        relation: "same-story",
        other: { key: "IES-700", title: "BE half", status: "In Test", assignee: "Benjamin" },
      },
      {
        ticketId: mine.id,
        relation: "same-story",
        other: { key: "IES-24571", title: "self", status: "Code Review" },
      },
      {
        ticketId: "id-elsewhere",
        relation: "you-wait-on",
        other: { key: "IES-600", title: "Not this card", status: "In Progress" },
      },
    ]);
    expect(keys(active)).toEqual(["IES-20097", "IES-700"]);
  });

  it("keeps blocks on the story itself, which heads the card instead of being a row", () => {
    const story = createTicket({
      id: "id-STORY",
      status: "In Progress",
      ref: { displayId: "STORY" },
    });
    const { active } = digestStoryAdjacency({
      rowIds: new Set([mine.id]),
      storyId: story.id,
      siblings: [],
      dependencies: [
        {
          ticketId: story.id,
          relation: "waits-on-you",
          other: { key: "IES-950", title: "Rollout", status: "To Do" },
        },
        {
          ticketId: story.id,
          relation: "you-wait-on",
          other: { key: "IES-850", title: "Platform", status: "In Progress" },
        },
        {
          ticketId: story.id,
          relation: "same-story",
          other: { key: "IES-750", title: "Not a sibling of the rows", status: "In Progress" },
        },
      ],
      hiddenKeys: new Set([mine.ref.displayId, "STORY"]),
      ticketsById: new Map([mine, story].map((t) => [t.id, t])),
      viewerName: "Philip",
    });
    expect(active.map((item) => [item.key, item.relation, item.viewerTicketKey])).toEqual([
      ["IES-850", "blocks-you", "STORY"],
      ["IES-950", "waits-on-you", "STORY"],
    ]);
  });
});

describe("digestStoryAdjacency on an epic card, with live blocks only", () => {
  const row = createTicket({
    id: "id-ACME-1",
    status: "In Progress",
    ref: { displayId: "ACME-1" },
  });
  const neighbours = ["ACME-20", "ACME-21", "ACME-22"].map((key) =>
    createTicket({ id: `id-${key}`, status: "In Progress", ref: { displayId: key } }),
  );
  const block = (key: string): DigestDependency => ({
    ticketId: row.id,
    relation: "waits-on-you",
    other: { key, title: key, status: "To Do" },
  });
  const epicAdjacency = (dependencies: readonly DigestDependency[], live = () => true) =>
    digestStoryAdjacency({
      rowIds: new Set([row.id]),
      storyId: "id-EPIC",
      siblings: neighbours,
      dependencies: [
        ...dependencies,
        {
          ticketId: row.id,
          relation: "same-story",
          other: { key: "ACME-23", title: "Older server link", status: "In Review" },
        },
      ],
      hiddenKeys: new Set(["ACME-1"]),
      ticketsById: new Map([row, ...neighbours].map((t) => [t.id, t])),
      viewerName: "Viewer",
      storyIsEpic: true,
      isBlockLive: live,
    });

  it("folds an epic's other stories into one count instead of pills", () => {
    const adjacency = epicAdjacency([block("ACME-30")]);
    expect(keys(adjacency.active)).toEqual(["ACME-30"]);
    expect(keys(adjacency.epic ?? [])).toEqual(["ACME-20", "ACME-21", "ACME-22", "ACME-23"]);
    expect(digestFoldedSummary(adjacency)).toBe("4 in epic");
  });

  it("leaves out a block that no longer holds anyone up", () => {
    const adjacency = epicAdjacency([block("ACME-30"), block("ACME-31")], () => false);
    expect(adjacency.active).toEqual([]);
  });

  it("shows at most the pill limit, the rest as '+N more'", () => {
    const many = ["ACME-30", "ACME-31", "ACME-32", "ACME-33", "ACME-34", "ACME-35"].map(block);
    const adjacency = epicAdjacency(many);
    expect(adjacency.active).toHaveLength(6);
    expect(DIGEST_ADJACENT_PILL_LIMIT).toBe(4);
    expect(digestFoldedSummary(adjacency)).toBe("2 more · 4 in epic");
  });

  it("keeps a story card's siblings as pills", () => {
    const { active, epic } = digestStoryAdjacency({
      rowIds: new Set([row.id]),
      siblings: neighbours,
      dependencies: [],
      hiddenKeys: new Set(),
      ticketsById: new Map([row, ...neighbours].map((t) => [t.id, t])),
      viewerName: "Viewer",
    });
    expect(keys(active)).toEqual(["ACME-20", "ACME-21", "ACME-22"]);
    expect(epic).toBeUndefined();
  });
});
