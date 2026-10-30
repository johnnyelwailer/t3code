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
      { provider: "atlassian" } as const,
      /Connect the Atlassian account/,
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

  it("tells a server answer from a lost reply, and will not record without a server", async () => {
    const deps = build(jira);
    expect(deps.isClearRejection?.(new BackendApiError("no"))).toBe(true);
    expect(deps.isClearRejection?.(new Error("Failed to reach backend"))).toBe(false);
    await expect(deps.record("d", "applied")).rejects.toThrow(/No server connection/);
  });
});
