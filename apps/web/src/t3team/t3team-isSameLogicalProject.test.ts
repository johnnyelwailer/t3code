import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { isSameLogicalProject } from "~/t3team/t3team-isSameLogicalProject";

const LOCAL = "env-local" as EnvironmentId;
const REMOTE = "env-remote" as EnvironmentId;

function project(environmentId: string, id: string, repository: string | null) {
  return {
    environmentId,
    id,
    workspaceRoot: `/work/${environmentId}/${id}`,
    isScratch: false,
    source: null,
    repositoryIdentity: repository
      ? {
          canonicalKey: repository,
          locator: { source: "git-remote", remoteName: "origin", remoteUrl: repository },
        }
      : null,
  };
}

vi.mock("~/state/entities", () => ({
  readProjects: () => [
    project("env-local", "local-a", "github.com/acme/app"),
    project("env-remote", "remote-a", "github.com/acme/app"),
    project("env-remote", "remote-b", "github.com/acme/other"),
  ],
}));
vi.mock("~/hooks/useSettings", () => ({
  getClientSettings: () => ({
    sidebarProjectGroupingMode: "repository",
    sidebarProjectGroupingOverrides: {},
  }),
}));

describe("isSameLogicalProject", () => {
  it("compares ids directly on the primary environment", () => {
    const base = {
      primaryEnvironmentId: LOCAL,
      rowEnvironmentId: LOCAL,
      requestProjectId: "local-a",
    };

    expect(isSameLogicalProject({ ...base, rowProjectId: "local-a" })).toBe(true);
    expect(isSameLogicalProject({ ...base, rowProjectId: "local-b" })).toBe(false);
  });

  it("accepts another environment's project the sidebar groups with the dragged item's", () => {
    const base = {
      primaryEnvironmentId: LOCAL,
      rowEnvironmentId: REMOTE,
      requestProjectId: "local-a",
    };

    expect(isSameLogicalProject({ ...base, rowProjectId: "remote-a" })).toBe(true);
    expect(isSameLogicalProject({ ...base, rowProjectId: "remote-b" })).toBe(false);
  });

  it("rejects a row whose project is not loaded", () => {
    expect(
      isSameLogicalProject({
        primaryEnvironmentId: LOCAL,
        rowEnvironmentId: REMOTE,
        requestProjectId: "local-a",
        rowProjectId: "missing",
      }),
    ).toBe(false);
  });
});
