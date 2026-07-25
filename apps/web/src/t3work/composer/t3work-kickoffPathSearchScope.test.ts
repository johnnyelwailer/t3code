import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  matchesT3workWorkspaceRoot,
  resolveT3workKickoffPathSearchScope,
  type T3workKickoffPathSearchProject,
} from "~/t3work/composer/t3work-kickoffPathSearchScope";

const primaryEnvironmentId = "env-primary" as EnvironmentId;
const projectEnvironmentId = "env-workspace" as EnvironmentId;

function liveProject(
  overrides: Partial<T3workKickoffPathSearchProject> = {},
): T3workKickoffPathSearchProject {
  return {
    id: "live-1" as T3workKickoffPathSearchProject["id"],
    workspaceRoot: "/Users/pj/.t3code/t3work/projects/IES NG",
    environmentId: projectEnvironmentId,
    ...overrides,
  };
}

describe("matchesT3workWorkspaceRoot", () => {
  it("matches identical absolute roots", () => {
    expect(matchesT3workWorkspaceRoot("/tmp/project", "/tmp/project")).toBe(true);
  });

  it("matches a home-relative stored root against the absolute live root", () => {
    expect(
      matchesT3workWorkspaceRoot(
        "/Users/pj/.t3code/t3work/projects/IES NG",
        "~/.t3code/t3work/projects/IES NG",
      ),
    ).toBe(true);
  });

  it("ignores trailing slashes and windows separators", () => {
    expect(matchesT3workWorkspaceRoot("C:/work/project/", "C:\\work\\project")).toBe(true);
  });

  it("does not match a different workspace", () => {
    expect(matchesT3workWorkspaceRoot("/Users/pj/other", "~/.t3code/t3work/projects/IES NG")).toBe(
      false,
    );
  });

  it("does not treat a bare `~` as a match", () => {
    expect(matchesT3workWorkspaceRoot("/Users/pj", "~")).toBe(false);
  });
});

describe("resolveT3workKickoffPathSearchScope", () => {
  it("prefers the environment-registered project, exactly like the chat composer", () => {
    const scope = resolveT3workKickoffPathSearchScope({
      workspaceRoot: "~/.t3code/t3work/projects/IES NG",
      primaryEnvironmentId,
      liveProjects: [liveProject({ workspaceRoot: "/Users/pj/Dev/other" }), liveProject()],
    });

    expect(scope).toEqual({
      environmentId: projectEnvironmentId,
      cwd: "/Users/pj/.t3code/t3work/projects/IES NG",
    });
  });

  it("falls back to the stored root and primary environment when no live project matches", () => {
    const scope = resolveT3workKickoffPathSearchScope({
      workspaceRoot: "/tmp/project-alpha",
      primaryEnvironmentId,
      liveProjects: [liveProject()],
    });

    expect(scope).toEqual({ environmentId: primaryEnvironmentId, cwd: "/tmp/project-alpha" });
  });

  it("yields a null cwd when the project has no workspace root", () => {
    const scope = resolveT3workKickoffPathSearchScope({
      workspaceRoot: null,
      primaryEnvironmentId,
      liveProjects: [liveProject()],
    });

    expect(scope).toEqual({ environmentId: primaryEnvironmentId, cwd: null });
  });

  it("treats a blank workspace root as absent", () => {
    const scope = resolveT3workKickoffPathSearchScope({
      workspaceRoot: "   ",
      primaryEnvironmentId,
      liveProjects: [liveProject()],
    });

    expect(scope.cwd).toBeNull();
  });
});
