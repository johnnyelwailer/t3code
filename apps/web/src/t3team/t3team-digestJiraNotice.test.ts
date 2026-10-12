import { describe, expect, it } from "vite-plus/test";

import { digestJiraHealth } from "~/t3team/mywork-digest/t3team-digestGraphHelpers";
import { resolveDigestJiraNotice } from "~/t3team/t3team-digestJiraNotice";
import { JIRA_SYNC_STALE_AFTER_MS } from "~/t3team/t3team-jiraSyncFreshness";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("digest Jira notice", () => {
  it("stays quiet while the sync is recent and the session works", () => {
    expect(
      resolveDigestJiraNotice({ jiraAuth: "ok", jiraSyncedAt: ago(2 * HOUR) }, NOW),
    ).toBeNull();
    expect(resolveDigestJiraNotice({}, NOW)).toBeNull();
  });

  it("asks to sign in when the session is dead, however fresh the data looks", () => {
    const notice = resolveDigestJiraNotice(
      { jiraAuth: "needs-reconnect", jiraSyncedAt: ago(HOUR) },
      NOW,
    );
    expect(notice).toMatchObject({ kind: "needs-reconnect", action: "sign-in" });
  });

  it("offers a retry, with the reason, when the last sync failed", () => {
    const notice = resolveDigestJiraNotice(
      { jiraAuth: "ok", jiraSyncError: "Jira did not answer.", jiraSyncedAt: ago(2 * HOUR) },
      NOW,
    );
    expect(notice).toMatchObject({
      kind: "sync-error",
      detail: "Jira did not answer.",
      action: "retry",
    });
  });

  it("flags a sync older than a day and leaves one just inside it alone", () => {
    expect(
      resolveDigestJiraNotice({ jiraSyncedAt: ago(JIRA_SYNC_STALE_AFTER_MS + HOUR) }, NOW),
    ).toMatchObject({ kind: "stale", action: "retry" });
    expect(
      resolveDigestJiraNotice({ jiraSyncedAt: ago(JIRA_SYNC_STALE_AFTER_MS - HOUR) }, NOW),
    ).toBeNull();
  });

  it("does not repeat the age the header strip already prints", () => {
    const notice = resolveDigestJiraNotice({ jiraSyncedAt: ago(26 * 24 * HOUR) }, NOW);
    expect(`${notice?.lead} ${notice?.detail}`).not.toMatch(/\d+ ?d\b/);
  });
});

describe("digest Jira health across projects", () => {
  it("lets one dead session speak for the whole digest", () => {
    expect(digestJiraHealth([{ jiraAuth: "ok" }, { jiraAuth: "needs-reconnect" }]).jiraAuth).toBe(
      "needs-reconnect",
    );
  });

  it("is silent when the server predates the fields", () => {
    expect(digestJiraHealth([{}, {}])).toEqual({});
  });

  it("carries the first sync failure", () => {
    expect(
      digestJiraHealth([{ jiraAuth: "ok" }, { jiraAuth: "ok", jiraSyncError: "Jira is down." }]),
    ).toEqual({ jiraAuth: "ok", jiraSyncError: "Jira is down." });
  });
});
