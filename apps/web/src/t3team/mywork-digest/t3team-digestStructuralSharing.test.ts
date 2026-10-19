import { describe, expect, it } from "vite-plus/test";

import { shareStructure } from "./t3team-digestStructuralSharing";

const build = () => ({
  scope: "all",
  tickets: [
    { id: "a", title: "First", labels: ["x", "y"] },
    { id: "b", title: "Second", labels: [] },
  ],
  jiraSyncedAt: "2026-10-13T10:00:00.000Z",
});

describe("shareStructure", () => {
  it("hands back the previous value when nothing differs", () => {
    const previous = build();
    expect(shareStructure(previous, build())).toBe(previous);
  });

  it("keeps every unchanged subtree when only a timestamp moved", () => {
    const previous = build();
    const next = { ...build(), jiraSyncedAt: "2026-10-13T10:05:00.000Z" };
    const shared = shareStructure(previous, next);

    expect(shared).not.toBe(previous);
    expect(shared.jiraSyncedAt).toBe("2026-10-13T10:05:00.000Z");
    expect(shared.tickets).toBe(previous.tickets);
  });

  it("replaces only the changed ticket", () => {
    const previous = build();
    const next = build();
    next.tickets[1] = { id: "b", title: "Second, renamed", labels: [] };
    const shared = shareStructure(previous, next);

    expect(shared.tickets).not.toBe(previous.tickets);
    expect(shared.tickets[0]).toBe(previous.tickets[0]);
    expect(shared.tickets[1]).toEqual({ id: "b", title: "Second, renamed", labels: [] });
  });

  it("treats an added, removed or reordered item as a change of the list", () => {
    const previous = build();
    const added = build();
    added.tickets.push({ id: "c", title: "Third", labels: [] });
    const removed = build();
    removed.tickets.pop();
    const reordered = build();
    reordered.tickets.reverse();

    expect(shareStructure(previous, added).tickets).not.toBe(previous.tickets);
    expect(shareStructure(previous, removed).tickets).not.toBe(previous.tickets);
    expect(shareStructure(previous, reordered).tickets.map((ticket) => ticket.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("notices a key that appeared or vanished", () => {
    const previous: Record<string, number> = { a: 1 };
    const grown = shareStructure(previous, { a: 1, b: 2 });
    const shrunk = shareStructure({ a: 1, b: 2 }, { a: 1 });

    expect(grown).toEqual({ a: 1, b: 2 });
    expect(grown).not.toBe(previous);
    expect(shrunk).toEqual({ a: 1 });
  });

  it("compares anything that is not a plain object or array by identity", () => {
    const stamp = new Date("2026-10-13T10:00:00.000Z");
    const previous = { stamp };
    const sameDateAgain = { stamp: new Date("2026-10-13T10:00:00.000Z") };

    expect(shareStructure(previous, sameDateAgain)).toBe(sameDateAgain);
    expect(shareStructure(previous, { stamp }).stamp).toBe(stamp);
  });

  it("is idempotent, so a state updater that runs twice lands the same value", () => {
    const previous = build();
    const next = build();
    next.tickets[0] = { id: "a", title: "First, renamed", labels: ["x", "y"] };

    const once = shareStructure(previous, next);
    const twice = shareStructure(previous, once);

    expect(twice).toBe(once);
    expect(twice.tickets[1]).toBe(previous.tickets[1]);
  });
});
