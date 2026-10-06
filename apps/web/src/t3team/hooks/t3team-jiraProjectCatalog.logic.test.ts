import { describe, expect, it } from "vite-plus/test";

import {
  boundCatalogEntryKeys,
  buildJiraCatalog,
  jiraCatalogEntryKey,
  unaddedCatalogProjects,
} from "./t3team-jiraProjectCatalog.logic";

const account = (id: string, accountUrl: string) => ({
  id,
  provider: "atlassian",
  label: "Philip Jonientz",
  accountUrl,
});
const project = (id: string, key: string, title: string) => ({
  id,
  provider: "atlassian",
  key,
  title,
});

const a = account("acc-a", "https://nexwork.atlassian.net");
const b = account("acc-b", "https://one-atlas-nofl.atlassian.net");

describe("buildJiraCatalog", () => {
  it("keys by (accountId, externalProjectId), so a key reused across sites stays two entries", () => {
    const catalog = buildJiraCatalog(
      [a, b],
      new Map([
        ["acc-a", [project("10001", "IES", "IES")]],
        ["acc-b", [project("10001", "IES", "IES (other site)")]],
      ]),
    );
    expect(catalog.map((entry) => entry.entryKey)).toEqual([
      jiraCatalogEntryKey("acc-a", "10001"),
      jiraCatalogEntryKey("acc-b", "10001"),
    ]);
    expect(catalog.map((entry) => entry.siteHost)).toEqual([
      "nexwork.atlassian.net",
      "one-atlas-nofl.atlassian.net",
    ]);
  });

  it("drops a repeated (account, project) pair and sorts by title", () => {
    const catalog = buildJiraCatalog(
      [a],
      new Map([
        [
          "acc-a",
          [project("2", "ZED", "Zed"), project("1", "ABC", "Abc"), project("2", "ZED", "Zed")],
        ],
      ]),
    );
    expect(catalog.map((entry) => entry.title)).toEqual(["Abc", "Zed"]);
  });

  it("ignores project lists for unknown accounts", () => {
    expect(buildJiraCatalog([a], new Map([["ghost", [project("1", "X", "X")]]]))).toEqual([]);
  });
});

describe("unaddedCatalogProjects", () => {
  const catalog = buildJiraCatalog(
    [a, b],
    new Map([
      ["acc-a", [project("1", "IES", "IES"), project("2", "OPS", "Ops")]],
      ["acc-b", [project("1", "IES", "IES elsewhere")]],
    ]),
  );

  it("treats only the exact (account, external id) binding as added", () => {
    const bound = boundCatalogEntryKeys([
      { source: { provider: "atlassian", accountId: "acc-a", externalProjectId: "1" } },
      { source: undefined },
      { source: { provider: "local" } },
    ]);
    expect(unaddedCatalogProjects(catalog, bound).map((entry) => entry.entryKey)).toEqual([
      jiraCatalogEntryKey("acc-b", "1"),
      jiraCatalogEntryKey("acc-a", "2"),
    ]);
  });
});
