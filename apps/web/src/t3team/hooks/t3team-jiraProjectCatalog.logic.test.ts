import { describe, expect, it } from "vite-plus/test";

import {
  boundCatalogEntryKeys,
  buildJiraCatalog,
  jiraCatalogEntryKey,
  jiraCatalogSiteFailure,
  loadJiraCatalogAccount,
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

describe("loadJiraCatalogAccount", () => {
  const cached = [project("9", "OLD", "Cached")];

  it("names the site and keeps its cached projects when the fetch fails", async () => {
    const result = await loadJiraCatalogAccount({
      account: b,
      cachedProjects: cached,
      listProjects: () => Promise.reject(new Error("site down")),
    });
    expect(result.projects).toEqual(cached);
    expect(result.failure).toEqual(jiraCatalogSiteFailure(b, new Error("site down")));
    expect(result.failure?.label).toBe("one-atlas-nofl.atlassian.net");
    expect(result.failure?.error).toBe("site down");
  });

  it("reports a site that has no cache, with a fallback message for a non-Error throw", async () => {
    const result = await loadJiraCatalogAccount({
      account: account("acc-c", ""),
      cachedProjects: null,
      listProjects: () => Promise.reject("nope"),
    });
    expect(result.projects).toBeNull();
    expect(result.failure).toMatchObject({
      accountId: "acc-c",
      label: "Philip Jonientz",
      error: "nope",
    });
  });

  it("clears the failure when the site answers", async () => {
    const live = [project("1", "NEX", "Nex")];
    const result = await loadJiraCatalogAccount({
      account: a,
      cachedProjects: cached,
      listProjects: () => Promise.resolve(live),
    });
    expect(result.failure).toBeNull();
    expect(result.projects).toEqual(live);
  });
});
