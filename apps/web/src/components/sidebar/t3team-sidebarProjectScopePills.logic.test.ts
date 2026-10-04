import { describe, expect, it } from "vite-plus/test";

import {
  projectScopeCastShadow,
  projectScopeDiscCapacity,
  projectScopeDiscDepth,
  selectProjectScopePillGroups,
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
