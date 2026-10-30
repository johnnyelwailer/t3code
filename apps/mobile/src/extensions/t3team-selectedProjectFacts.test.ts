import { describe, expect, it } from "vite-plus/test";

import { selectedProjectFacts } from "./t3team-selectedProjectFacts";

describe("selectedProjectFacts", () => {
  it("carries the selected project's id, environment and repository identity, not just its title", () => {
    const identity = {
      canonicalKey: "nexplore.ghe.com/acme/api",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "https://nexplore.ghe.com/acme/api.git",
      },
      owner: "acme",
      name: "api",
    };
    const facts = selectedProjectFacts({
      id: "p-2",
      environmentId: "env-local",
      title: "API",
      workspaceRoot: "/work/api",
      repositoryIdentity: identity,
    } as never);
    expect(facts).toEqual({
      id: "p-2",
      environmentId: "env-local",
      title: "API",
      workspaceRoot: "/work/api",
      repositoryIdentity: identity,
    });
  });

  it("is null for no project and has a null identity for a project without a repository", () => {
    expect(selectedProjectFacts(null)).toBeNull();
    expect(
      selectedProjectFacts({
        id: "p-3",
        environmentId: "env-local",
        title: "Notes",
        workspaceRoot: "/work/notes",
      } as never)?.repositoryIdentity,
    ).toBeNull();
  });
});
