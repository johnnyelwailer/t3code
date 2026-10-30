import { describe, expect, it, vi } from "vite-plus/test";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { BackendApiError } from "~/t3team/backend/t3team-t3BackendHttp";
import { buildChangeSetDeps } from "~/t3team/changeset/t3team-changeSetDeps";

const atlassian = {
  updateIssueStatus: vi.fn(async () => ({ status: "Done" })),
} as unknown as AtlassianBackendApi;
const jira = {
  provider: "atlassian",
  accountId: "acct",
  externalProjectId: "10042",
  externalProjectKey: "NXAI",
} as const;
const build = (source: Parameters<typeof buildChangeSetDeps>[0]["source"]) =>
  buildChangeSetDeps({ threadId: "t", source, atlassian, httpBaseUrl: undefined });

describe("buildChangeSetDeps", () => {
  it("can apply for a Jira-bound project with an account", () => {
    const deps = build(jira);
    expect(deps.acceptOp).toBeDefined();
    expect(deps.unavailableReason).toBeUndefined();
  });

  it.each([
    [
      "a project bound to another provider",
      { ...jira, provider: "github" } as const,
      /not connected to Jira/,
    ],
    ["a local project", { provider: "local" } as const, /not connected to Jira/],
    ["no project source", undefined, /not connected to Jira/],
    [
      "a Jira project without an account",
      { provider: "atlassian", externalProjectKey: "NXAI" } as const,
      /Connect the Atlassian account/,
    ],
    [
      "a Jira project whose key is unknown",
      { provider: "atlassian", accountId: "acct" } as const,
      /Jira key is unknown/,
    ],
  ])("cannot apply for %s, and says why", (_name, source, reason) => {
    const deps = build(source);
    expect(deps.acceptOp).toBeUndefined();
    expect(deps.unavailableReason).toMatch(reason);
  });

  it("cannot apply without an Atlassian backend", () => {
    const deps = buildChangeSetDeps({
      threadId: "t",
      source: jira,
      atlassian: undefined,
      httpBaseUrl: undefined,
    });
    expect(deps.acceptOp).toBeUndefined();
  });

  it.each([400, 403, 404, 409, 422])("treats a %i answer as a clear rejection", (status) => {
    expect(build(jira).isClearRejection?.(new BackendApiError("no", undefined, status))).toBe(true);
  });

  it.each([500, 502, 503, 504])("treats a %i answer as possibly applied", (status) => {
    expect(build(jira).isClearRejection?.(new BackendApiError("gateway", undefined, status))).toBe(
      false,
    );
  });

  it.each([
    ["a timeout", new Error("Backend request timed out after 15000ms")],
    ["a network error", new TypeError("Failed to fetch")],
    ["an answer without a status", new BackendApiError("no")],
    ["something unknown", "boom"],
  ])("treats %s as possibly applied", (_name, cause) => {
    expect(build(jira).isClearRejection?.(cause)).toBe(false);
  });

  it("will not record without a server", async () => {
    await expect(build(jira).record("d", "applied")).rejects.toThrow(/No server connection/);
  });
});
