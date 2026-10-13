import { describe, expect, it } from "vite-plus/test";

import { digestJiraSyncLabel } from "~/t3team/t3team-ProjectMyWorkDigestAutoStatus";
import { digestJiraHealth } from "~/t3team/mywork-digest/t3team-digestGraphHelpers";

const nowMs = Date.parse("2026-10-13T12:00:00.000Z");

describe("digestJiraSyncLabel", () => {
  it("says a first sync is in progress instead of a blank or the fetch time", () => {
    expect(
      digestJiraSyncLabel({
        jiraSyncedAt: undefined,
        jiraSyncPending: true,
        updatedAtMs: nowMs,
        nowMs,
      }),
    ).toBe("Jira sync in progress");
  });

  it("prefers a pending project over another project's sync time", () => {
    expect(
      digestJiraSyncLabel({
        jiraSyncedAt: "2026-10-13T11:58:00.000Z",
        jiraSyncPending: true,
        updatedAtMs: nowMs,
        nowMs,
      }),
    ).toBe("Jira sync in progress");
  });

  it("prints the sync age once a catch-up has finished", () => {
    expect(
      digestJiraSyncLabel({
        jiraSyncedAt: "2026-10-13T11:58:00.000Z",
        jiraSyncPending: false,
        updatedAtMs: nowMs,
        nowMs,
      }),
    ).toMatch(/^Jira synced .+ ago$/);
  });

  it("falls back to the fetch time only for a host that reports no sync at all", () => {
    expect(
      digestJiraSyncLabel({
        jiraSyncedAt: undefined,
        jiraSyncPending: false,
        updatedAtMs: nowMs,
        nowMs,
      }),
    ).toMatch(/^auto · updated /);
    expect(
      digestJiraSyncLabel({
        jiraSyncedAt: undefined,
        jiraSyncPending: false,
        updatedAtMs: undefined,
        nowMs,
      }),
    ).toBeNull();
  });
});

describe("digestJiraHealth", () => {
  it("marks the digest pending while any project's first sync runs", () => {
    expect(
      digestJiraHealth([{ jiraAuth: "ok" }, { jiraAuth: "ok", jiraSyncPending: true }]),
    ).toEqual({ jiraAuth: "ok", jiraSyncPending: true });
    expect(digestJiraHealth([{ jiraAuth: "ok" }])).toEqual({ jiraAuth: "ok" });
  });
});
