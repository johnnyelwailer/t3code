import { describe, expect, it } from "vitest";
import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project } from "~/types";

import {
  normalizeWorkspaceRootPath,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
} from "./t3work-threadBridge";

function makeLiveProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.make("live-project"),
    environmentId: "env-local" as EnvironmentId,
    name: "Loose workspace",
    cwd: "/workspace/loose",
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    ...overrides,
  };
}

function makeStoredProject(overrides: Partial<ProjectShellProject> = {}): ProjectShellProject {
  return {
    id: "stored-project" as never,
    title: "Saved project",
    source: {
      provider: "atlassian",
      externalProjectId: "jira-123",
    },
    workspace: {
      rootPath: "/workspace/saved",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeWorkspaceRootPath", () => {
  it("strips trailing slashes and normalizes drive separators", () => {
    expect(normalizeWorkspaceRootPath("/workspace/project///")).toBe("/workspace/project");
    expect(normalizeWorkspaceRootPath("c:\\workspace\\project\\")).toBe("C:/workspace/project");
  });
});

describe("resolveCanonicalProjectId", () => {
  it("matches a live project when the stored workspace root only differs by a trailing slash", () => {
    const canonicalProjectId = resolveCanonicalProjectId(
      makeStoredProject({
        workspace: {
          rootPath: "/workspace/saved/",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      }),
      [makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/workspace/saved" })],
    );

    expect(canonicalProjectId).toBe(ProjectId.make("live-saved"));
  });
});

describe("resolveCanonicalProjectIdForWorkspaceRoot", () => {
  it("matches a live project when the workspace root only differs by a trailing slash", () => {
    const canonicalProjectId = resolveCanonicalProjectIdForWorkspaceRoot(
      "/workspace/saved/",
      "stored-project",
      [makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/workspace/saved" })],
    );

    expect(canonicalProjectId).toBe(ProjectId.make("live-saved"));
  });
});
