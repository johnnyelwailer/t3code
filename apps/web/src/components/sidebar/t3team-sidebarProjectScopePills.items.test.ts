import { describe, expect, it } from "vite-plus/test";

import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { buildScopePillItems } from "./t3team-sidebarProjectScopePills.items";
import { splitProjectScopePills } from "./t3team-sidebarProjectScopePills.logic";

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

describe("buildScopePillItems", () => {
  it("puts app projects first and namespaces add keys", () => {
    const items = buildScopePillItems([group("a"), group("b")], [entry("x", "1", "s.net")]);
    expect(items.map((item) => [item.kind, item.projectKey])).toEqual([
      ["app", "a"],
      ["app", "b"],
      ["add", "jira-add:x::1"],
    ]);
  });

  it("names the site only when several sites are connected", () => {
    const single = buildScopePillItems([], [entry("x", "1", "s.net")]);
    const multi = buildScopePillItems([], [entry("x", "1", "s.net"), entry("y", "1", "t.net")]);
    expect(single[0]?.kind === "add" && single[0].label).toBe("IES");
    expect(multi.map((item) => item.kind === "add" && item.label)).toEqual([
      "IES (s.net)",
      "IES (t.net)",
    ]);
  });

  it("splits app + add into discs and a +N overflow, keeping the active scope", () => {
    const items = buildScopePillItems(
      [group("a"), group("b"), group("c")],
      [entry("x", "1", "s.net"), entry("x", "2", "s.net")],
    );
    const { shown, overflow } = splitProjectScopePills(items, "c", 3);
    expect(shown.map((item) => item.projectKey)).toEqual(["a", "c"]);
    expect(overflow.map((item) => item.projectKey)).toEqual([
      "b",
      "jira-add:x::1",
      "jira-add:x::2",
    ]);
  });
});
