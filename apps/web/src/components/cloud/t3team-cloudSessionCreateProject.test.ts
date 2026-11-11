import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveCloudSessionCreateProject,
  resolveCloudSessionCreateProjectOutcome,
} from "./t3team-cloudSessionCreateProject";

const local = EnvironmentId.make("local");
const cloud = EnvironmentId.make("cloud-0437");
const localProject = ProjectId.make("p-local");
const cloudProject = ProjectId.make("p-cloud");
const projects = [
  { environmentId: "local", projectId: localProject, logicalKey: "hive/pti-polassist" },
  { environmentId: "cloud-0437", projectId: cloudProject, logicalKey: "hive/pti-polassist" },
  { environmentId: "local", projectId: ProjectId.make("p-other"), logicalKey: "hive/other" },
];

describe("resolveCloudSessionCreateProject", () => {
  it("keeps a project on this computer as it is", () => {
    expect(
      resolveCloudSessionCreateProject({
        projectRef: { environmentId: local, projectId: localProject },
        primaryEnvironmentId: local,
        projectKey: "hive/pti-polassist",
        projects,
      }),
    ).toEqual({ environmentId: local, projectId: localProject });
  });

  it("maps a cloud machine's copy to the same project on this computer", () => {
    expect(
      resolveCloudSessionCreateProject({
        projectRef: { environmentId: cloud, projectId: cloudProject },
        primaryEnvironmentId: local,
        projectKey: "hive/pti-polassist",
        projects,
      }),
    ).toEqual({ environmentId: local, projectId: localProject });
  });

  it("has no project when this computer lacks the project", () => {
    expect(
      resolveCloudSessionCreateProject({
        projectRef: { environmentId: cloud, projectId: cloudProject },
        primaryEnvironmentId: local,
        projectKey: "hive/missing",
        projects,
      }),
    ).toBeUndefined();
  });

  it("has no project without a composer project or a primary environment", () => {
    expect(
      resolveCloudSessionCreateProject({
        projectRef: null,
        primaryEnvironmentId: local,
        projectKey: null,
        projects,
      }),
    ).toBeUndefined();
    expect(
      resolveCloudSessionCreateProject({
        projectRef: { environmentId: cloud, projectId: cloudProject },
        primaryEnvironmentId: null,
        projectKey: "hive/pti-polassist",
        projects,
      }),
    ).toBeUndefined();
  });
});

describe("resolveCloudSessionCreateProjectOutcome", () => {
  const outcome = (projectKey: string | null) =>
    resolveCloudSessionCreateProjectOutcome({
      projectRef: { environmentId: cloud, projectId: cloudProject },
      primaryEnvironmentId: local,
      projectKey,
      projects,
    });

  it("reports the twin it found", () => {
    expect(outcome("hive/pti-polassist")).toEqual({
      kind: "project",
      project: { environmentId: local, projectId: localProject },
    });
  });

  // The hint the Run-on menu shows instead of starting a session with no project at all.
  it("reports a project that lives only on cloud machines, so the menu can say so", () => {
    expect(outcome("hive/missing")).toEqual({
      kind: "elsewhere",
      projectRef: { environmentId: cloud, projectId: cloudProject },
    });
  });

  it("claims nothing about this computer when the copies cannot be matched", () => {
    expect(outcome(null)).toEqual({ kind: "none" });
    expect(
      resolveCloudSessionCreateProjectOutcome({
        projectRef: null,
        primaryEnvironmentId: local,
        projectKey: "hive/pti-polassist",
        projects,
      }),
    ).toEqual({ kind: "none" });
  });
});
