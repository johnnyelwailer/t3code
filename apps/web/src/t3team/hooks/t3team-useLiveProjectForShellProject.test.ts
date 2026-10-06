import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import type { Project } from "~/types";
import { findLiveProjectForShellProject } from "./t3team-useLiveProjectForShellProject";

const shellProject = (overrides: Record<string, unknown>): ProjectShellProject =>
  ({
    id: "shell-1",
    title: "Nexi",
    source: { provider: "atlassian" },
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }) as ProjectShellProject;

const liveProject = (id: string, workspaceRoot: string): Project =>
  ({ id, workspaceRoot, title: id }) as unknown as Project;

describe("findLiveProjectForShellProject", () => {
  const live = [liveProject("live-a", "/work/a"), liveProject("live-b", "/work/b")];

  it("finds the live project with the same id", () => {
    expect(findLiveProjectForShellProject(shellProject({ id: "live-b" }), live)?.id).toBe("live-b");
  });

  it("falls back to the live project that owns the same workspace root", () => {
    const project = shellProject({
      workspace: { rootPath: "/work/a/", createdAt: "" },
    });
    expect(findLiveProjectForShellProject(project, live)?.id).toBe("live-a");
  });

  it("is null for a project with no live counterpart (the tracker avatar is the fallback)", () => {
    expect(findLiveProjectForShellProject(shellProject({}), live)).toBeNull();
  });
});
