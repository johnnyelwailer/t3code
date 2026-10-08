import { describe, expect, it } from "vite-plus/test";

import {
  projectScopeCastShadow,
  projectScopeDiscCapacity,
  projectScopeDiscDepth,
  selectProjectScopePillGroups,
  splitProjectScopePills,
} from "./t3team-sidebarProjectScopePills.logic";

const groups = ["a", "b", "c", "d", "e"].map((projectKey) => ({ projectKey }));

describe("selectProjectScopePillGroups", () => {
  it("takes the leading groups in list order", () => {
    expect(selectProjectScopePillGroups(groups, null, 3).map((g) => g.projectKey)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps the active scope visible by replacing the last slot", () => {
    expect(selectProjectScopePillGroups(groups, "e", 3).map((g) => g.projectKey)).toEqual([
      "a",
      "b",
      "e",
    ]);
  });

  it("leaves the order alone when the active scope is already shown", () => {
    expect(selectProjectScopePillGroups(groups, "b", 3).map((g) => g.projectKey)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores an active scope that no group has", () => {
    expect(selectProjectScopePillGroups(groups, "zz", 2).map((g) => g.projectKey)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns nothing for a zero budget", () => {
    expect(selectProjectScopePillGroups(groups, "a", 0)).toEqual([]);
  });
});

describe("projectScopeDiscCapacity", () => {
  it("grows one disc per (size − overlap) once All and the label are paid for", () => {
    expect(projectScopeDiscCapacity(0)).toBe(0);
    expect(projectScopeDiscCapacity(28 + 124)).toBe(0);
    expect(projectScopeDiscCapacity(28 + 124 + 20)).toBe(1);
    expect(projectScopeDiscCapacity(28 + 124 + 100)).toBe(5);
  });
});

describe("projectScopeDiscDepth", () => {
  it("forms a pyramid around the top index", () => {
    expect(projectScopeDiscDepth(2, 2)).toEqual({ depth: 0, coveredSide: null });
    expect(projectScopeDiscDepth(0, 2)).toEqual({ depth: 2, coveredSide: "right" });
    expect(projectScopeDiscDepth(4, 2)).toEqual({ depth: 2, coveredSide: "left" });
  });
});

describe("projectScopeCastShadow", () => {
  it("gets blurrier and fainter further down, never vanishing", () => {
    expect(projectScopeCastShadow(1)).toBe("0 0 6.5px 1.5px rgba(0,0,0,0.14)");
    expect(projectScopeCastShadow(6)).toBe("0 0 19px 4px rgba(0,0,0,0.04)");
  });
});

describe("splitProjectScopePills", () => {
  const keys = (items: ReadonlyArray<{ projectKey: string }>) => items.map((i) => i.projectKey);

  it("shows everything with no overflow when it fits beside the picker disc", () => {
    const result = splitProjectScopePills(groups, null, 6);
    expect(keys(result.shown)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.overflow).toEqual([]);
  });

  it("never hands the picker disc's slot to a project", () => {
    const result = splitProjectScopePills(groups, null, 5);
    expect(keys(result.shown)).toEqual(["a", "b", "c", "d"]);
    expect(keys(result.overflow)).toEqual(["e"]);
  });

  it("reserves one slot for the +N disc and lists the rest in order", () => {
    const result = splitProjectScopePills(groups, null, 3);
    expect(keys(result.shown)).toEqual(["a", "b"]);
    expect(keys(result.overflow)).toEqual(["c", "d", "e"]);
  });

  it("keeps the active scope visible instead of overflowing it", () => {
    const result = splitProjectScopePills(groups, "e", 3);
    expect(keys(result.shown)).toEqual(["a", "e"]);
    expect(keys(result.overflow)).toEqual(["b", "c", "d"]);
  });

  it("mixes app and add items by list order", () => {
    const mixed = [
      { projectKey: "app-1" },
      { projectKey: "jira:x::1" },
      { projectKey: "jira:x::2" },
    ];
    const result = splitProjectScopePills(mixed, null, 2);
    expect(keys(result.shown)).toEqual(["app-1"]);
    expect(keys(result.overflow)).toEqual(["jira:x::1", "jira:x::2"]);
  });

  it("lists every site behind +N when no disc fits", () => {
    const result = splitProjectScopePills(groups, null, 1);
    expect(keys(result.shown)).toEqual([]);
    expect(keys(result.overflow)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
