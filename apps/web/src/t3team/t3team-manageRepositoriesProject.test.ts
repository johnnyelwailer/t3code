import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import { resolveManageRepositoriesProject } from "~/t3team/t3team-manageRepositoriesProject";

function project(id: string): ProjectShellProject {
  return {
    id: id as ProjectShellProject["id"],
    title: id,
    source: { provider: "local" },
    workspace: { rootPath: `/tmp/${id}`, createdAt: "2026-10-01T00:00:00.000Z" },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("resolveManageRepositoriesProject", () => {
  it("opens the dialog for a loose project that exists only in allProjects", () => {
    // Regression: the lookup read the stored `projects`, so "Manage linked repositories" on a
    // live-only workspace project resolved to null and the dialog never rendered.
    const stored = project("stored");
    const loose = project("loose-live-only");
    const store = { projects: [stored], allProjects: [stored, loose] };

    expect(resolveManageRepositoriesProject(store, "loose-live-only")).toBe(loose);
    expect(resolveManageRepositoriesProject(store, "stored")).toBe(stored);
  });

  it("returns null when nothing is requested or the project is gone", () => {
    const store = { allProjects: [project("a")] };
    expect(resolveManageRepositoriesProject(store, null)).toBeNull();
    expect(resolveManageRepositoriesProject(store, "missing")).toBeNull();
  });
});
