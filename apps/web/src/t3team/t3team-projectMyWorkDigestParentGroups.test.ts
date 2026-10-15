import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { digestParentGroups, digestSubtaskParent } from "./t3team-projectMyWorkDigestParentGroups";
import { digestYesterdayGroupSummary } from "./t3team-projectMyWorkDigestYesterdayRecap";

const story = (id: string, key: string) =>
  createTicket({
    id,
    projectId: "p1",
    issueType: "Story",
    issueTypeIsSubtask: false,
    ref: { displayId: key, title: key },
  });
const sub = (id: string, key: string, parentId: string) =>
  createTicket({
    id,
    projectId: "p1",
    parentId,
    issueType: "Sub-task",
    issueTypeIsSubtask: true,
    ref: { displayId: key, title: "FE: Review" },
  });

const tickets = [
  story("s1", "IES-23265"),
  sub("a", "IES-23704", "s1"),
  sub("b", "IES-23705", "s1"),
  story("s2", "IES-20767"),
  createTicket({
    id: "s3",
    projectId: "p1",
    parentId: "epic",
    issueType: "Story",
    issueTypeIsSubtask: false,
    ref: { displayId: "IES-25450", title: "x" },
  }),
  createTicket({
    id: "epic",
    projectId: "p1",
    issueType: "Epic",
    ref: { displayId: "IES-13161", title: "PI-9" },
  }),
  sub("orphan", "IES-1", "missing"),
  story("s4", "IES-20032"),
  sub("c", "IES-23720", "s4"),
];
const byId = new Map(tickets.map((t) => [t.id, t]));
const shape = (ids: string[]) =>
  digestParentGroups(ids, (id) => id, byId).map((g) => ({
    parent: g.parent?.id ?? null,
    parentItem: g.parentItem,
    items: g.items,
  }));

describe("digest parent groups", () => {
  it("nests subtasks under their story at the first subtask's place", () => {
    expect(shape(["s2", "a", "s3", "b"])).toEqual([
      { parent: null, parentItem: undefined, items: ["s2"] },
      { parent: "s1", parentItem: undefined, items: ["a", "b"] },
      { parent: null, parentItem: undefined, items: ["s3"] },
    ]);
  });

  it("makes a listed story the header of its subtasks instead of a second row", () => {
    expect(shape(["c", "s4"])).toEqual([{ parent: "s4", parentItem: "s4", items: ["c"] }]);
  });

  it("leaves stories under epics and subtasks with no held parent standalone", () => {
    expect(shape(["s3", "orphan"]).map((g) => g.parent)).toEqual([null, null]);
    expect(digestSubtaskParent(byId.get("s3"), byId)).toBeUndefined();
  });

  it("recognises a subtask by type name when the flag is missing", () => {
    const t = createTicket({
      id: "z",
      projectId: "p1",
      parentId: "s1",
      issueType: "Subtask",
      ref: { displayId: "IES-9", title: "z" },
    });
    expect(digestSubtaskParent(t, byId)?.id).toBe("s1");
  });
});

describe("the yesterday group summary", () => {
  it("rolls up outcomes most common first, then merged PRs", () => {
    const item = (to: string | undefined, merged = 0) => ({
      id: Math.random().toString(),
      key: "k",
      title: "t",
      ...(to ? { outcome: { to } } : {}),
      merged: Array.from({ length: merged }, () => ({}) as never),
      lastAtMs: 0,
    });
    expect(
      digestYesterdayGroupSummary([
        item("Done"),
        item("In Test"),
        item("Done", 1),
        item(undefined),
      ]),
    ).toBe("2 → Done · 1 → In Test · 1 PR merged");
    expect(digestYesterdayGroupSummary([])).toBe("");
  });
});
