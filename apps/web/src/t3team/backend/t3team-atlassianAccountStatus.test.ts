import { describe, expect, it } from "vite-plus/test";

import { usableAccounts, type AtlassianAccountStatus } from "./t3team-atlassianAccountStatus";
import { isJiraSessionExpiredError } from "./t3team-t3BackendHttp";

const account = (id: string, status: AtlassianAccountStatus["status"]): AtlassianAccountStatus => ({
  id,
  provider: "atlassian",
  label: id,
  status,
  needsReconnect: status === "needs-reconnect",
});

describe("usable Jira accounts", () => {
  it("hands project loading only the accounts whose session works", () => {
    const usable = usableAccounts([account("a", "connected"), account("b", "needs-reconnect")]);
    expect(usable.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("raises the session-expired error when every stored account is signed out", () => {
    expect.assertions(1);
    try {
      usableAccounts([account("a", "needs-reconnect")]);
    } catch (error) {
      expect(isJiraSessionExpiredError(error)).toBe(true);
    }
  });

  it("returns an empty list when nothing is stored, which is not a dead session", () => {
    expect(usableAccounts([])).toEqual([]);
  });
});
