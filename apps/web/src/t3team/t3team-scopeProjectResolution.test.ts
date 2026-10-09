import type { ScopedProjectRef } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import {
  pickScopedDefaultProject,
  resolveScopeTeamProjectId,
} from "./t3team-scopeProjectResolution";

const project = (id: string) => ({ id }) as unknown as ProjectShellProject;
const ref = (environmentId: string, projectId: string) =>
  ({ environmentId, projectId }) as unknown as ScopedProjectRef;
const identity = (id: string) => id;

describe("resolveScopeTeamProjectId", () => {
  it("is null for All projects", () => {
    expect(
      resolveScopeTeamProjectId({
        scopedProjectId: null,
        scopedProjectRefs: null,
        allProjects: [project("a")],
        resolveProjectId: identity,
      }),
    ).toBeNull();
  });

  it("resolves a loose workspace that only allProjects knows", () => {
    expect(
      resolveScopeTeamProjectId({
        scopedProjectId: "loose-1",
        scopedProjectRefs: [ref("env", "loose-1")],
        allProjects: [project("stored-1"), project("loose-1")],
        resolveProjectId: identity,
      }),
    ).toBe("loose-1");
  });

  it("remaps a live group id onto the stored project that owns it", () => {
    expect(
      resolveScopeTeamProjectId({
        scopedProjectId: "live-1",
        scopedProjectRefs: [ref("env", "live-1")],
        allProjects: [project("stored-1")],
        resolveProjectId: (id) => (id === "live-1" ? "stored-1" : id),
      }),
    ).toBe("stored-1");
  });

  it("falls back to another member of the group the store knows", () => {
    expect(
      resolveScopeTeamProjectId({
        scopedProjectId: "rep",
        scopedProjectRefs: [ref("env-a", "rep"), ref("env-b", "member-b")],
        allProjects: [project("member-b")],
        resolveProjectId: identity,
      }),
    ).toBe("member-b");
  });

  it("is null when no member resolves", () => {
    expect(
      resolveScopeTeamProjectId({
        scopedProjectId: "ghost",
        scopedProjectRefs: [ref("env", "ghost")],
        allProjects: [project("a")],
        resolveProjectId: identity,
      }),
    ).toBeNull();
  });
});

describe("pickScopedDefaultProject", () => {
  const projects = [
    { environmentId: "env-a", id: "p1" },
    { environmentId: "env-b", id: "p2" },
    { environmentId: "env-a", id: "p3" },
  ];

  it("keeps the fallback when unscoped", () => {
    expect(
      pickScopedDefaultProject({
        orderedProjects: projects,
        scopedProjectRefs: null,
        offlineEnvironmentIds: new Set(),
        fallback: projects[0],
      }),
    ).toBe(projects[0]);
  });

  it("starts in the scoped project, not the first ordered one", () => {
    expect(
      pickScopedDefaultProject({
        orderedProjects: projects,
        scopedProjectRefs: [ref("env-a", "p3")],
        offlineEnvironmentIds: new Set(),
        fallback: projects[0],
      }),
    ).toBe(projects[2]);
  });

  it("skips a scoped member on an unreachable machine", () => {
    expect(
      pickScopedDefaultProject({
        orderedProjects: projects,
        scopedProjectRefs: [ref("env-b", "p2"), ref("env-a", "p3")],
        offlineEnvironmentIds: new Set(["env-b"]),
        fallback: projects[0],
      }),
    ).toBe(projects[2]);
  });

  it("falls back when every scoped member is unreachable or absent", () => {
    expect(
      pickScopedDefaultProject({
        orderedProjects: projects,
        scopedProjectRefs: [ref("env-b", "p2")],
        offlineEnvironmentIds: new Set(["env-b"]),
        fallback: projects[0],
      }),
    ).toBe(projects[0]);
    expect(
      pickScopedDefaultProject({
        orderedProjects: projects,
        scopedProjectRefs: [ref("env-z", "gone")],
        offlineEnvironmentIds: new Set(),
        fallback: projects[0],
      }),
    ).toBe(projects[0]);
  });
});
