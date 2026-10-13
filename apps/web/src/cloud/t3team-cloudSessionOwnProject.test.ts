import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveCloudSessionOwnProject } from "./t3team-cloudSessionOwnProject";

const VM = EnvironmentId.make("env-vm");
const LOCAL = EnvironmentId.make("env-local");
const CHECKOUT = "/home/runner/_work/_temp/project/repository";

const projects = [
  // The composer's copy: a managed workspace with no remote, keyed by its local path.
  { environmentId: LOCAL, id: ProjectId.make("local"), workspaceRoot: "/Users/pj/.t3code/IES NG" },
  // A project the session's snapshot restored: same machine, not what the server started in.
  {
    environmentId: VM,
    id: ProjectId.make("restored"),
    workspaceRoot: "/home/runner/.t3home/projects/old",
  },
  // The project the session's server registered from its working directory.
  { environmentId: VM, id: ProjectId.make("own"), workspaceRoot: CHECKOUT },
];

const base = {
  target: { sessionId: "run-1", projectKey: "physical:env-local:/Users/pj/.t3code/IES NG" },
  projectKey: "physical:env-local:/Users/pj/.t3code/IES NG",
  sessions: [{ sessionId: "run-1", environmentId: "env-vm" }],
  serverCwdOf: (environmentId: EnvironmentId) => (environmentId === VM ? `${CHECKOUT}/` : null),
  projects,
};

describe("resolveCloudSessionOwnProject", () => {
  it("is the project the session's server started in, though its key differs from the composer's", () => {
    expect(resolveCloudSessionOwnProject(base)).toEqual({
      environmentId: VM,
      projectId: ProjectId.make("own"),
    });
  });

  it("is none for a session set up for another project, or for none", () => {
    expect(resolveCloudSessionOwnProject({ ...base, projectKey: "repo:acme/other" })).toBeNull();
    expect(
      resolveCloudSessionOwnProject({ ...base, target: { sessionId: "run-1", projectKey: null } }),
    ).toBeNull();
    expect(resolveCloudSessionOwnProject({ ...base, target: null })).toBeNull();
  });

  it("is none until the session is ready on an environment that reported its working directory", () => {
    expect(
      resolveCloudSessionOwnProject({ ...base, sessions: [{ sessionId: "run-1" }] }),
    ).toBeNull();
    expect(resolveCloudSessionOwnProject({ ...base, serverCwdOf: () => null })).toBeNull();
  });

  it("is none while the server has not registered its project yet", () => {
    expect(
      resolveCloudSessionOwnProject({
        ...base,
        projects: projects.filter((project) => project.id !== ProjectId.make("own")),
      }),
    ).toBeNull();
  });
});
