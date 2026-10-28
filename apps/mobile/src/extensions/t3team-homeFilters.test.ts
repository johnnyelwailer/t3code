import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildHomeProjectScopes } from "../features/home/homeThreadList";
import { makeThreadShellFixture } from "../test-fixtures";
import { buildHomeFiltersProps, type HomeFiltersSource } from "./t3team-homeFilters";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");

function project(id: string, title: string, environmentId = local): EnvironmentProject {
  return {
    environmentId,
    id: ProjectId.make(id),
    title,
    workspaceRoot: `/workspaces/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function thread(projectId: string, updatedAt: string): EnvironmentThreadShell {
  return makeThreadShellFixture({
    environmentId: local,
    projectId: ProjectId.make(projectId),
    id: ThreadId.make(`thread-${projectId}`),
    title: projectId,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt,
    archivedAt: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  });
}

function setup(overrides: Partial<HomeFiltersSource> = {}) {
  const projects = [project("alpha", "Alpha"), project("beta", "Beta"), project("gamma", "Gamma")];
  const source: HomeFiltersSource = {
    threads: [thread("beta", "2026-06-03T00:00:00.000Z"), thread("alpha", "2026-06-02T00:00:00.000Z")],
    pendingTasks: [],
    projectSortOrder: "updated_at",
    environments: [
      { environmentId: local, label: "Laptop" },
      { environmentId: remote, label: "Cloud" },
    ],
    selectedEnvironmentId: null,
    selectedProjectKey: null,
    onEnvironmentChange: vi.fn(),
    onProjectChange: vi.fn(),
    ...overrides,
  };
  const scopes = buildHomeProjectScopes({
    projects,
    environmentId: null,
    projectGroupingMode: "separate",
  });
  return { source, scopes, props: buildHomeFiltersProps(source, scopes) };
}

describe("buildHomeFiltersProps", () => {
  it("lists the projects most recently active first, then by title", () => {
    expect(setup().props.projects.map((entry) => entry.label)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("hands out environment ids as plain strings and reports the current selection", () => {
    const { props } = setup({ selectedEnvironmentId: remote, selectedProjectKey: "k" });
    expect(props.environments).toEqual([
      { id: "local", label: "Laptop" },
      { id: "remote", label: "Cloud" },
    ]);
    expect(props.selectedEnvironmentId).toBe("remote");
    expect(props.selectedProjectKey).toBe("k");
  });

  it("forwards a known selection and clearing, and ignores an unknown id or key", () => {
    const { source, props } = setup();
    props.onSelectEnvironment("remote");
    props.onSelectEnvironment(null);
    props.onSelectEnvironment("nowhere");
    expect(source.onEnvironmentChange).toHaveBeenCalledTimes(2);
    expect(source.onEnvironmentChange).toHaveBeenNthCalledWith(1, remote);
    expect(source.onEnvironmentChange).toHaveBeenNthCalledWith(2, null);

    const key = props.projects[0]!.key;
    props.onSelectProject(key);
    props.onSelectProject(null);
    props.onSelectProject("missing");
    expect(source.onProjectChange).toHaveBeenCalledTimes(2);
    expect(source.onProjectChange).toHaveBeenNthCalledWith(1, key);
    expect(source.onProjectChange).toHaveBeenNthCalledWith(2, null);
  });
});
