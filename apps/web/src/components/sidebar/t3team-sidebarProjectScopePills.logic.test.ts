import { describe, expect, it } from "vite-plus/test";

import { selectProjectScopePillGroups } from "./t3team-sidebarProjectScopePills.logic";

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
