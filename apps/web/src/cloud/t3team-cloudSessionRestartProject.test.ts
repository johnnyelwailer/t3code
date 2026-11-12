import {
  EnvironmentId,
  ProjectId,
  RepositoryIdentity,
  plainProjectFolderName,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  deriveLogicalProjectKeyFromSettings,
  type ProjectGroupingMode,
} from "@t3tools/client-runtime/state/project-grouping";
import {
  logicalProjectPerEnvironment,
  resolveCloudSessionRestartProjectId,
} from "./t3team-cloudSessionOwnProject";

const desktop = EnvironmentId.make("desktop");
const cloud = EnvironmentId.make("cloud");
const identity = Schema.decodeSync(RepositoryIdentity)({
  canonicalKey: "github.com/owner/repo",
  locator: {
    source: "git-remote",
    remoteName: "origin",
    remoteUrl: "https://github.com/owner/repo",
  },
});
const local = {
  environmentId: desktop,
  id: ProjectId.make("local"),
  title: "repo",
  workspaceRoot: "c:\\work\\repo",
  repositoryIdentity: identity,
};
const own = {
  ...local,
  environmentId: cloud,
  id: ProjectId.make("own"),
  workspaceRoot: "/workspace/repo",
};
const restored = {
  ...own,
  id: ProjectId.make("restored"),
  repositoryIdentity: null,
  workspaceRoot: "/restored/other",
};

function resolutionInput(mode: ProjectGroupingMode) {
  const projects = [restored, local, own];
  const settings = { sidebarProjectGroupingMode: mode, sidebarProjectGroupingOverrides: {} };
  const key = deriveLogicalProjectKeyFromSettings(own, settings);
  const logicalProjectEnvironments = logicalProjectPerEnvironment(
    projects,
    (project) => deriveLogicalProjectKeyFromSettings(project, settings) === key,
    null,
  ).map((project) => ({ ...project, isPrimary: project.environmentId === desktop }));
  return {
    environmentId: cloud,
    primaryEnvironmentId: desktop,
    serverCwd: "/workspace/repo",
    projects,
    logicalProjectEnvironments,
  };
}

describe("resolveCloudSessionRestartProjectId", () => {
  it.each<ProjectGroupingMode>(["repository", "separate"])(
    "restarts the non-primary machine's own project with %s grouping",
    (mode) => {
      const input = resolutionInput(mode);
      expect(input.logicalProjectEnvironments.some((environment) => environment.isPrimary)).toBe(
        mode === "repository",
      );
      expect(resolveCloudSessionRestartProjectId(input)).toBe(local.id);
    },
  );

  it("uses the existing folder binding for a plain project", () => {
    const input = resolutionInput("separate");
    const serverCwd = `/workspace/${plainProjectFolderName(local.title, local.id)}`;
    const projects = [
      { ...local, repositoryIdentity: null },
      { ...own, workspaceRoot: serverCwd, repositoryIdentity: null },
    ];
    expect(resolveCloudSessionRestartProjectId({ ...input, serverCwd, projects })).toBe(local.id);
  });

  it("does not assume an unbound cloud folder belongs to the only local repository", () => {
    const input = resolutionInput("separate");
    const projects = [local, { ...own, repositoryIdentity: null }];
    expect(resolveCloudSessionRestartProjectId({ ...input, projects })).toBeNull();
  });

  it("does not restart an unrelated primary project when the own project is missing", () => {
    const input = resolutionInput("repository");
    expect(resolveCloudSessionRestartProjectId({ ...input, serverCwd: "/missing" })).toBeNull();
  });
});
