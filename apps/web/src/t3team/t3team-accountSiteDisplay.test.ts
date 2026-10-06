import { describe, expect, it } from "vite-plus/test";

import { accountSiteHost, dedupeAccountsBySite } from "./t3team-accountSiteDisplay";

const account = (id: string, accountUrl?: string) => ({
  id,
  provider: "atlassian",
  label: "Philip Jonientz",
  ...(accountUrl ? { accountUrl } : {}),
});

describe("accountSiteHost", () => {
  it("reduces a site URL to its lowercase host", () => {
    expect(accountSiteHost(account("a", "https://NexWork.atlassian.net/"))).toBe(
      "nexwork.atlassian.net",
    );
  });

  it("handles a scheme-less value and a missing URL", () => {
    expect(accountSiteHost(account("a", "nexwork.atlassian.net/jira"))).toBe(
      "nexwork.atlassian.net",
    );
    expect(accountSiteHost(account("a"))).toBeNull();
  });
});

describe("dedupeAccountsBySite", () => {
  it("keeps two same-named accounts on different sites", () => {
    const rows = dedupeAccountsBySite([
      account("a", "https://nexwork.atlassian.net"),
      account("b", "https://one-atlas-nofl.atlassian.net"),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("collapses accounts that share a host and repeated ids", () => {
    const rows = dedupeAccountsBySite([
      account("a", "https://nexwork.atlassian.net"),
      account("b", "https://nexwork.atlassian.net/"),
      account("a", "https://other.atlassian.net"),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("never merges accounts that have no URL", () => {
    expect(dedupeAccountsBySite([account("a"), account("b")]).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
