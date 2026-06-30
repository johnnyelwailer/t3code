import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  readProjectSetupProfileIdFromProject,
  readProjectSidecarCompositionFromProject,
} from "./t3work-createProjectBootstrap.js";

function createProject(raw: Record<string, unknown>): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw,
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("readProjectSidecarCompositionFromProject", () => {
  it("reads sidecarSections from synced agentSetup cache", () => {
    const project = createProject({
      agentSetup: {
        profileId: "engineering-copilot",
        sidecarSections: {
          sections: [{ sectionId: "qa" }, { sectionId: "recent", visible: false }],
        },
      },
    });

    expect(readProjectSetupProfileIdFromProject(project)).toBe("engineering-copilot");
    expect(readProjectSidecarCompositionFromProject(project)).toEqual({
      sections: [{ sectionId: "qa" }, { sectionId: "recent", visible: false }],
    });
  });

  it("returns undefined when sidecarSections is missing or invalid", () => {
    expect(readProjectSidecarCompositionFromProject(createProject({}))).toBeUndefined();
    expect(
      readProjectSidecarCompositionFromProject(
        createProject({
          agentSetup: {
            sidecarSections: { sections: [{ sectionId: "" }] },
          },
        }),
      ),
    ).toBeUndefined();
  });
});
