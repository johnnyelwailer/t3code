import { describe, expect, it } from "vite-plus/test";

import { buildDigestTransitionNames } from "~/t3team/t3team-digestTransitionNames";
import type { DigestSection, ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

function section(
  id: string,
  placement: DigestSection["placement"],
  ticketIds: readonly string[],
): DigestSection {
  return {
    id,
    kind: "items",
    widget: "my-work.tickets",
    placement,
    heading: id,
    items: ticketIds.map((ticketId) => ({ ticketId })),
  };
}

function plan(sections: readonly DigestSection[]): ResolvedDigestPlan {
  return {
    producer: "heuristic",
    producedAt: "2026-10-13T10:00:00.000Z",
    sections: [...sections],
    droppedTicketIds: [],
    newSinceTicketIds: [],
  };
}

function everyName(
  names: ReturnType<typeof buildDigestTransitionNames>,
  sectionIds: readonly string[],
  ticketIds: readonly string[],
): string[] {
  return [
    ...sectionIds.flatMap((id) => [names.section(id), names.standalone(id)]),
    ...sectionIds.flatMap((id) => ticketIds.map((ticketId) => names.row(id, ticketId))),
  ].filter((name): name is string => name !== undefined);
}

describe("buildDigestTransitionNames", () => {
  it("names every section and every ticket row once, and none twice", () => {
    const names = buildDigestTransitionNames(
      plan([
        section("needs-you", "side", ["a"]),
        section("in-progress", "main", ["b", "c"]),
        section("rest", "footer", ["d"]),
      ]),
    );

    const all = everyName(names, ["needs-you", "in-progress", "rest"], ["a", "b", "c", "d"]);

    expect(names.section("in-progress")).toBeDefined();
    expect(names.row("in-progress", "b")).toBeDefined();
    expect(names.row("needs-you", "b")).toBeUndefined();
    expect(new Set(all).size).toBe(all.length);
  });

  it("names a ticket shown in two sections only where it comes first", () => {
    const names = buildDigestTransitionNames(
      plan([section("main-lane", "main", ["a"]), section("side-lane", "side", ["a"])]),
    );

    expect(names.row("side-lane", "a")).toBeDefined();
    expect(names.row("main-lane", "a")).toBeUndefined();
  });

  it("names a ticket listed twice in one section not at all", () => {
    const names = buildDigestTransitionNames(plan([section("doubled", "main", ["a", "a", "b"])]));

    expect(names.row("doubled", "a")).toBeUndefined();
    expect(names.row("doubled", "b")).toBeDefined();
  });

  it("leaves a repeated section id and everything inside it unnamed", () => {
    const names = buildDigestTransitionNames(
      plan([section("same", "main", ["a"]), section("same", "footer", ["b"])]),
    );

    expect(names.section("same")).toBeUndefined();
    expect(names.standalone("same")).toBeUndefined();
    expect(names.story("same", "parent")).toBeUndefined();
    expect(names.row("same", "a")).toBeUndefined();
  });

  it("keeps a story that two sections both hold apart", () => {
    const names = buildDigestTransitionNames(
      plan([section("one", "main", ["a"]), section("two", "main", ["b"])]),
    );

    expect(names.story("one", "story-1")).not.toBe(names.story("two", "story-1"));
  });
});
