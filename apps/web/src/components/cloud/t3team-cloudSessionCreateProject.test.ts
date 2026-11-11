import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveCloudSessionCreateProject } from "./t3team-cloudSessionCreateProject";

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
