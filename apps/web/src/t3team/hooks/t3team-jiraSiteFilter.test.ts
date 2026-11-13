import { describe, expect, it } from "vite-plus/test";

import type { JiraCatalogSiteFailure } from "./t3team-jiraProjectCatalog.logic";
import {
  catalogForJiraSite,
  classifyJiraSiteFailure,
  collectJiraSiteChips,
  shouldShowJiraSiteChips,
  toggleJiraSiteFilter,
} from "./t3team-jiraSiteFilter";

const failure = (accountId: string, host: string, error: string): JiraCatalogSiteFailure => ({
  accountId,
  provider: "atlassian",
  siteHost: host,
  label: host,
  error,
});

describe("collectJiraSiteChips", () => {
  it("is hidden when only one site is present", () => {
    const chips = collectJiraSiteChips([{ accountId: "a", siteHost: "example-one.atlassian.net" }]);
    expect(shouldShowJiraSiteChips(chips)).toBe(false);
    expect(chips).toHaveLength(1);
  });

  it("lists every site once when two or more are connected", () => {
    const chips = collectJiraSiteChips([
      { accountId: "a", siteHost: "example-one.atlassian.net" },
      { accountId: "a", siteHost: "example-one.atlassian.net" },
      { accountId: "b", siteHost: "example-two.atlassian.net" },
    ]);
    expect(shouldShowJiraSiteChips(chips)).toBe(true);
    expect(chips.map((chip) => chip.label)).toEqual([
      "example-one.atlassian.net",
      "example-two.atlassian.net",
    ]);
    expect(chips.every((chip) => chip.status === "ok")).toBe(true);
  });

  it("marks a failed site on its chip, including sites with no projects", () => {
    const chips = collectJiraSiteChips(
      [{ accountId: "a", siteHost: "example-one.atlassian.net" }],
      [
        failure("b", "example-two.atlassian.net", "ENOTFOUND"),
        failure("c", "example-three.atlassian.net", "401 Unauthorized: token expired"),
      ],
    );
    expect(shouldShowJiraSiteChips(chips)).toBe(true);
    expect(chips.find((chip) => chip.id === "b")).toMatchObject({ status: "offline" });
    expect(chips.find((chip) => chip.id === "c")).toMatchObject({ status: "auth-expired" });
  });
});

describe("classifyJiraSiteFailure", () => {
  it("treats auth-expired wording as sign-in expired, anything else as offline", () => {
    expect(classifyJiraSiteFailure("network timeout")).toBe("offline");
    expect(classifyJiraSiteFailure("ENOTFOUND")).toBe("offline");
    expect(classifyJiraSiteFailure("OAuth token expired")).toBe("auth-expired");
    expect(classifyJiraSiteFailure("401 unauthorized")).toBe("auth-expired");
  });
});

describe("toggleJiraSiteFilter and catalogForJiraSite", () => {
  const catalog = [
    { accountId: "a", title: "One" },
    { accountId: "b", title: "Two" },
  ];

  it("narrows to the clicked site and clears on a second click", () => {
    expect(toggleJiraSiteFilter(null, "a")).toBe("a");
    expect(toggleJiraSiteFilter("a", "a")).toBeNull();
    expect(toggleJiraSiteFilter("a", "b")).toBe("b");
    expect(catalogForJiraSite(catalog, "b")).toEqual([{ accountId: "b", title: "Two" }]);
    expect(catalogForJiraSite(catalog, null)).toEqual(catalog);
  });
});
