import {
  AtlassianApiError,
  AtlassianAuthError,
  AtlassianNetworkError,
  AtlassianOAuthSessionExpiredError,
} from "@t3tools/integrations-atlassian";
import { describe, expect, it } from "vite-plus/test";

import {
  ATLASSIAN_SESSION_EXPIRED_MESSAGE,
  reconnectRequiredError,
} from "./t3team-atlassian-auth-staleToken.ts";
import { JIRA_TIMEOUT_CODE, T3TeamAtlassianError } from "./t3team-atlassian-errors.ts";
import {
  describeMirrorSyncFailure,
  MIRROR_SYNC_ACCESS_DENIED_TEXT,
  MIRROR_SYNC_FAILED_TEXT,
  MIRROR_SYNC_JIRA_DOWN_TEXT,
  MIRROR_SYNC_RATE_LIMITED_TEXT,
  MIRROR_SYNC_UNREACHABLE_TEXT,
} from "./t3team-atlassian-mirrorSyncFailureText.ts";
import { combineCatchUp } from "./t3team-atlassian-syncCatchUp.ts";
import { combineAccountSyncStatus, toJiraSyncStatus } from "./t3team-atlassian-syncStatus.ts";

const wrapped = (cause: unknown) =>
  new T3TeamAtlassianError({ message: "Failed to fetch Atlassian mirror page.", cause });

const state = (fields: {
  lastSuccessAtMs?: number;
  lastError?: string;
  lastErrorAtMs?: number;
}) => ({
  watermarkMs: undefined,
  lastSuccessAtMs: fields.lastSuccessAtMs,
  lastError: fields.lastError,
  lastErrorAtMs: fields.lastErrorAtMs,
});

describe("describeMirrorSyncFailure", () => {
  it.each([
    [
      "a 429 deep in the cause chain",
      wrapped(
        new AtlassianApiError({ status: 429, message: "<html>slow down</html>", path: "/s" }),
      ),
      MIRROR_SYNC_RATE_LIMITED_TEXT,
    ],
    [
      "a network failure",
      wrapped(new AtlassianNetworkError({ cause: new Error("ECONNRESET"), path: "/search" })),
      MIRROR_SYNC_UNREACHABLE_TEXT,
    ],
    [
      "a request timeout",
      new T3TeamAtlassianError({ code: JIRA_TIMEOUT_CODE, message: "timed out after 12000ms" }),
      MIRROR_SYNC_UNREACHABLE_TEXT,
    ],
    [
      "a 403 on the project",
      wrapped(new AtlassianAuthError({ status: 403, message: "Forbidden", path: "/project/IES" })),
      MIRROR_SYNC_ACCESS_DENIED_TEXT,
    ],
    [
      "a Jira 5xx",
      wrapped(new AtlassianApiError({ status: 503, message: "Service Unavailable", path: "/s" })),
      MIRROR_SYNC_JIRA_DOWN_TEXT,
    ],
    [
      "the typed session-expired error",
      reconnectRequiredError(),
      ATLASSIAN_SESSION_EXPIRED_MESSAGE,
    ],
    [
      "a dead refresh token",
      wrapped(new AtlassianOAuthSessionExpiredError({ message: "refresh_token is invalid" })),
      ATLASSIAN_SESSION_EXPIRED_MESSAGE,
    ],
    ["anything else", new Error("SQLITE_BUSY at /home/u/state.sqlite"), MIRROR_SYNC_FAILED_TEXT],
  ])("%s reads as one plain sentence", (_label, error, expected) => {
    expect(describeMirrorSyncFailure(error)).toBe(expected);
  });
});

describe("toJiraSyncStatus", () => {
  it("is empty before the first catch-up", () => {
    expect(toJiraSyncStatus(state({}))).toEqual({});
  });

  it("reports a failure newer than the last success", () => {
    expect(
      toJiraSyncStatus(
        state({
          lastSuccessAtMs: 100,
          lastError: MIRROR_SYNC_RATE_LIMITED_TEXT,
          lastErrorAtMs: 200,
        }),
      ),
    ).toEqual({ lastSyncAt: 100, lastError: MIRROR_SYNC_RATE_LIMITED_TEXT });
  });

  it("drops a failure the last success already superseded", () => {
    expect(
      toJiraSyncStatus(
        state({ lastSuccessAtMs: 300, lastError: MIRROR_SYNC_FAILED_TEXT, lastErrorAtMs: 200 }),
      ),
    ).toEqual({ lastSyncAt: 300 });
  });

  it("leaves a dead session to the needs-reconnect flag", () => {
    expect(
      toJiraSyncStatus(state({ lastError: ATLASSIAN_SESSION_EXPIRED_MESSAGE, lastErrorAtMs: 200 })),
    ).toEqual({});
  });
});

describe("combineAccountSyncStatus", () => {
  it("takes the newest success and the newest unresolved failure across projects", () => {
    expect(
      combineAccountSyncStatus([
        state({
          lastSuccessAtMs: 100,
          lastError: MIRROR_SYNC_UNREACHABLE_TEXT,
          lastErrorAtMs: 150,
        }),
        state({ lastSuccessAtMs: 400, lastError: MIRROR_SYNC_FAILED_TEXT, lastErrorAtMs: 300 }),
        state({ lastError: MIRROR_SYNC_RATE_LIMITED_TEXT, lastErrorAtMs: 250 }),
      ]),
    ).toEqual({ lastSyncAt: 400, lastError: MIRROR_SYNC_RATE_LIMITED_TEXT });
  });

  it("is empty for an account with no synced project", () => {
    expect(combineAccountSyncStatus([])).toEqual({});
  });
});

describe("combineCatchUp", () => {
  const progress = (fields: {
    pagesWalked: number;
    lastPageMs?: number;
    reachedMs?: number;
    lastPageAtMs: number;
  }) => ({ accountId: "acct", lastPageMs: undefined, reachedMs: undefined, ...fields });

  it("is absent when no project is catching up", () => {
    expect(combineCatchUp([])).toBeUndefined();
  });

  it("sums the pages, reports the newest page's duration and the slowest project's reach", () => {
    expect(
      combineCatchUp([
        progress({ pagesWalked: 40, lastPageMs: 900, reachedMs: 5_000, lastPageAtMs: 1 }),
        progress({ pagesWalked: 10, lastPageMs: 300, reachedMs: 2_000, lastPageAtMs: 2 }),
      ]),
    ).toEqual({ pagesWalked: 50, lastPageMs: 300, reachedAt: 2_000 });
  });

  it("omits the reach until a catch-up page has been stored", () => {
    expect(
      combineCatchUp([progress({ pagesWalked: 3, lastPageMs: 120, lastPageAtMs: 1 })]),
    ).toEqual({ pagesWalked: 3, lastPageMs: 120 });
  });
});
