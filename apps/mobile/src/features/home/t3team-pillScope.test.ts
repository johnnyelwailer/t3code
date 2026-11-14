import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../connection/catalog", () => ({ environmentCatalog: {} }));
vi.mock("../../state/atom-registry", () => ({ appAtomRegistry: {} }));
vi.mock("../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("../../state/preferences", () => ({ mobilePreferencesAtom: {} }));
vi.mock("../../state/server", () => ({ environmentServerConfigsAtom: {} }));

import { buildHomeProjectScopes } from "./homeThreadList";
import { pillScopedNewTaskProject } from "./t3team-pillScope";

function makeProject(id: string, environmentId: string, repository: string): EnvironmentProject {
  return {
    environmentId: EnvironmentId.make(environmentId),
    id: ProjectId.make(id),
    title: repository,
    workspaceRoot: `/work/${id}`,
    repositoryIdentity: {
      canonicalKey: `github.com/acme/${repository}`,
      locator: {
        source: "git-remote",
        remoteName: "origin",
        remoteUrl: `https://github.com/acme/${repository}.git`,
      },
    },
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

const projects = [
  makeProject("app-local", "local", "app"),
  makeProject("api-local", "local", "api"),
  makeProject("app-cloud", "cloud", "app"),
];
const appKey = buildHomeProjectScopes({
  projects,
  environmentId: null,
  projectGroupingMode: "repository",
}).find((scope) => scope.title === "app")!.key;

const preselect = (
  filters: { environmentId: string | null; projectKey: string | null },
  enabled = ["local", "cloud"],
) =>
  pillScopedNewTaskProject({
    projects,
    filters: {
      environmentId:
        filters.environmentId === null ? null : EnvironmentId.make(filters.environmentId),
      projectKey: filters.projectKey,
    },
    projectGroupingMode: "repository",
    pillEnvironmentIds: new Set(enabled),
  });

describe("pillScopedNewTaskProject", () => {
  it("preselects the Home pills' project and environment", () => {
    expect(preselect({ environmentId: "cloud", projectKey: null })).toEqual({
      environmentId: "cloud",
      projectId: "app-cloud",
    });
    expect(preselect({ environmentId: "cloud", projectKey: appKey })?.projectId).toBe("app-cloud");
    expect(preselect({ environmentId: null, projectKey: appKey })?.projectId).toBe("app-local");
  });

  it("keeps the default with no pill, and drops an environment switched off in Settings", () => {
    expect(preselect({ environmentId: null, projectKey: null })).toBeUndefined();
    expect(preselect({ environmentId: "cloud", projectKey: null }, ["local"])).toBeUndefined();
  });
});
