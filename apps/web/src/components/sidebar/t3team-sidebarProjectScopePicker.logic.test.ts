import { describe, expect, it } from "vite-plus/test";

import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import {
  buildScopePickerEntries,
  scopePickerLabel,
  visibleScopePickerEntries,
} from "./t3team-sidebarProjectScopePicker.logic";

const group = (projectKey: string) =>
  ({ projectKey, displayName: projectKey }) as unknown as SidebarProjectSnapshot;
const entry = (accountId: string, id: string, siteHost: string): JiraCatalogProject => ({
  entryKey: `${accountId}::${id}`,
  accountId,
  provider: "atlassian",
  externalProjectId: id,
  key: "IES",
  title: "IES",
  iconUrl: undefined,
  siteHost,
});

describe("buildScopePickerEntries", () => {
  it("lists the overflow, then the shown discs, then add candidates, then All", () => {
    const entries = buildScopePickerEntries(
      [group("a"), group("b")],
      [group("c")],
      [entry("x", "1", "s.net")],
    );
    expect(entries.map((entry) => [entry.kind, entry.value])).toEqual([
      ["app", "c"],
      ["app", "a"],
      ["app", "b"],
      ["add", "jira-add:x::1"],
      ["all", "all"],
    ]);
  });

  it("names the site only when several sites are connected", () => {
    const single = buildScopePickerEntries([], [], [entry("x", "1", "s.net")]);
    const multi = buildScopePickerEntries(
      [],
      [],
      [entry("x", "1", "s.net"), entry("y", "2", "t.net")],
    );
    expect(single[2]?.label).toBe("IES");
    expect(multi.map((entry) => (entry.kind === "add" ? entry.label : null))).toEqual([
      "IES (s.net)",
      "IES (t.net)",
    ]);
  });
});

describe("visibleScopePickerEntries", () => {
  const entries = buildScopePickerEntries([group("a")], [group("b")], [entry("x", "1", "s.net")]);

  it("hides add candidates while the query is empty", () => {
    for (const query of ["", "   "]) {
      expect(visibleScopePickerEntries(entries, query).map((entry) => entry.kind)).toEqual([
        "app",
        "app",
        "all",
      ]);
    }
  });

  it("keeps them for any query", () => {
    expect(visibleScopePickerEntries(entries, "i").map((entry) => entry.kind)).toEqual([
      "app",
      "app",
      "add",
      "all",
    ]);
  });
});

describe("scopePickerLabel", () => {
  it("counts the overflow and always says it searches", () => {
    expect(scopePickerLabel(0)).toBe("Search projects");
    expect(scopePickerLabel(1)).toBe("1 more project, search projects");
    expect(scopePickerLabel(3)).toBe("3 more projects, search projects");
  });
});
