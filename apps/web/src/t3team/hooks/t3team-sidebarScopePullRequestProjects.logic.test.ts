import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveSidebarScopePullRequestProjects,
  sidebarScopePullRequestSelectionKey,
} from "./t3team-sidebarScopePullRequestProjects.logic";

const env = "env-1" as EnvironmentId;
const otherEnv = "env-2" as EnvironmentId;
const project = (id: string, environmentId: EnvironmentId, remote?: string) => ({
  id,
  environmentId,
  repositoryIdentity: remote ? { canonicalKey: remote } : null,
});
const ref = (projectId: string, environmentId: EnvironmentId = env) => ({
  environmentId,
  projectId: projectId as ProjectId,
});

describe("resolveSidebarScopePullRequestProjects", () => {
  it("scopes a git workspace to its own members", () => {
    const selection = resolveSidebarScopePullRequestProjects({
      scopedProjectRefs: [ref("repo-a")],
      projects: [
        project("repo-a", env, "github.com/acme/a"),
        project("repo-b", env, "github.com/acme/b"),
      ],
      linkedRepositoryKeysByProjectId: new Map(),
    });
    expect([...selection.projectKeys]).toEqual(["env-1:repo-a"]);
    expect(selection.projectIdsByEnvironment.get(env)).toEqual(["repo-a"]);
  });

  it("widens a work-source project to the workspace projects of its linked repositories", () => {
    const selection = resolveSidebarScopePullRequestProjects({
      scopedProjectRefs: [ref("jira")],
      projects: [
        project("jira", env),
        project("repo-a", env, "github.com/acme/a"),
        project("repo-b", env, "GitHub.com/Acme/B"),
        project("repo-c", otherEnv, "github.com/acme/c"),
      ],
      linkedRepositoryKeysByProjectId: new Map([
        ["jira", ["github.com/acme/b", "github.com/acme/c"]],
      ]),
    });
    expect([...selection.projectKeys].sort()).toEqual([
      "env-1:jira",
      "env-1:repo-b",
      "env-2:repo-c",
    ]);
    expect(selection.projectIdsByEnvironment.get(env)).toEqual(["jira", "repo-b"]);
    expect(selection.projectIdsByEnvironment.get(otherEnv)).toEqual(["repo-c"]);
  });

  it("keeps a linked repository with no workspace project out of the per-environment ask", () => {
    const selection = resolveSidebarScopePullRequestProjects({
      scopedProjectRefs: [ref("jira")],
      projects: [project("jira", env)],
      linkedRepositoryKeysByProjectId: new Map([["jira", ["github.com/acme/missing"]]]),
    });
    expect(selection.projectIdsByEnvironment.get(env)).toEqual(["jira"]);
  });
});

describe("sidebarScopePullRequestSelectionKey", () => {
  it("is order-independent and empty for no scope", () => {
    const a = resolveSidebarScopePullRequestProjects({
      scopedProjectRefs: [ref("x"), ref("y")],
      projects: [],
      linkedRepositoryKeysByProjectId: new Map(),
    });
    const b = resolveSidebarScopePullRequestProjects({
      scopedProjectRefs: [ref("y"), ref("x")],
      projects: [],
      linkedRepositoryKeysByProjectId: new Map(),
    });
    expect(sidebarScopePullRequestSelectionKey(a)).toBe(sidebarScopePullRequestSelectionKey(b));
    expect(sidebarScopePullRequestSelectionKey(null)).toBe("");
  });
});
