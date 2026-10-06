import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import { opensAllProjectsMyWorkHome } from "./t3team-appMainContentResolution";

const project = (provider: string) =>
  ({ id: provider, name: provider, source: { provider } }) as unknown as ProjectShellProject;

const home = (allProjects: ProjectShellProject[], selectedProjectId: string | null = null) =>
  opensAllProjectsMyWorkHome({
    allProjects,
    selectedProjectId,
    showInitialSetup: false,
    hasRouteView: false,
  });

describe("opensAllProjectsMyWorkHome", () => {
  it("opens My Work when any work project exists and nothing is selected", () => {
    expect(home([project("local"), project("atlassian")])).toBe(true);
  });
  it("stays on the new conversation without a work project, or with a project selected", () => {
    expect(home([project("local")])).toBe(false);
    expect(home([project("atlassian")], "atlassian")).toBe(false);
  });
});
