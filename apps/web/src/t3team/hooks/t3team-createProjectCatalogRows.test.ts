import { describe, expect, it } from "vite-plus/test";

import {
  jiraCatalogEntryKey,
  type JiraCatalogProject,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import {
  buildCatalogRows,
  mapBoundProjectIds,
  spansMultipleSites,
} from "./t3team-createProjectCatalogRows";

const entry = (
  accountId: string,
  externalProjectId: string,
  title: string,
  key: string,
  siteHost: string,
): JiraCatalogProject => ({
  entryKey: jiraCatalogEntryKey(accountId, externalProjectId),
  accountId,
  provider: "atlassian",
  externalProjectId,
  key,
  title,
  iconUrl: undefined,
  siteHost,
});

const catalog = [
  entry("a", "1", "IES NG", "IES", "nexplore.atlassian.net"),
  entry("a", "2", "Mobile Checkout", "MOB", "nexplore.atlassian.net"),
  entry("b", "1", "Ops Board", "OPS", "acme.atlassian.net"),
];

describe("create-project catalog rows", () => {
  it("maps only Jira-bound app projects, by account and external id", () => {
    const bound = mapBoundProjectIds([
      {
        id: "p1",
        source: { provider: "atlassian", accountId: "a", externalProjectId: "2" } as never,
      },
      { id: "p2", source: { provider: "local" } as never },
      { id: "p3" },
    ]);
    expect([...bound]).toEqual([["a::2", "p1"]]);
  });

  it("separates added projects from available ones and links them to the app project", () => {
    const rows = buildCatalogRows(catalog, new Map([["a::2", "p1"]]), "");
    expect(rows.available.map((row) => row.entry.title)).toEqual(["IES NG", "Ops Board"]);
    expect(rows.added).toEqual([{ entry: catalog[1], existingProjectId: "p1" }]);
  });

  it("requires every word to match title, key or site", () => {
    expect(buildCatalogRows(catalog, new Map(), "ies").available).toHaveLength(1);
    expect(buildCatalogRows(catalog, new Map(), "acme ops").available).toHaveLength(1);
    expect(buildCatalogRows(catalog, new Map(), "acme ies").available).toHaveLength(0);
  });

  it("filters added projects with the same query", () => {
    const rows = buildCatalogRows(catalog, new Map([["a::2", "p1"]]), "mob");
    expect(rows.available).toHaveLength(0);
    expect(rows.added).toHaveLength(1);
  });

  it("knows when more than one site is involved", () => {
    expect(spansMultipleSites(catalog)).toBe(true);
    expect(spansMultipleSites(catalog.slice(0, 2))).toBe(false);
    expect(spansMultipleSites([])).toBe(false);
  });
});
