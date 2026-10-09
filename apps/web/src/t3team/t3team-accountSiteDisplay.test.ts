import { describe, expect, it } from "vite-plus/test";

import { accountSiteHost } from "./t3team-accountSiteDisplay";

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
