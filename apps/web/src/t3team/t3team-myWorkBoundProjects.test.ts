import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { resolveMyWorkBoundProjects } from "~/t3team/t3team-myWorkBoundProjects";

const jiraProject = {
  id: "nexi",
  title: "Nexi AI",
  source: { provider: "atlassian", externalProjectId: "NXAI", raw: {} },
} as unknown as ProjectShellProject;

const known = {
  storedProjects: [] as ReadonlyArray<ProjectShellProject>,
  liveProjects: [],
  shellsBootstrapped: true,
  projectSnapshotsReady: false,
};

describe("resolveMyWorkBoundProjects", () => {
  it("stays unknown until stored projects hydrate and shells bootstrap", () => {
    expect(resolveMyWorkBoundProjects({ ...known, storedProjects: null })).toBeNull();
    expect(resolveMyWorkBoundProjects({ ...known, shellsBootstrapped: false })).toBeNull();
  });

  it("does not treat a bootstrapped empty list as no Jira before the live snapshot", () => {
    expect(resolveMyWorkBoundProjects(known)).toBeNull();
  });

  it("settles empty once the live snapshot confirms there is no work source", () => {
    expect(resolveMyWorkBoundProjects({ ...known, projectSnapshotsReady: true })).toEqual([]);
  });

  it("returns a bound project as soon as one is known, without waiting out the snapshot", () => {
    const bound = resolveMyWorkBoundProjects({ ...known, storedProjects: [jiraProject] });
    expect(bound?.map((project) => project.id)).toEqual(["nexi"]);
  });
});
