import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  logicalProjectPerEnvironment,
  resolveCloudSessionOwnProject,
} from "./t3team-cloudSessionOwnProject";

const VM = EnvironmentId.make("env-vm");
const LOCAL = EnvironmentId.make("env-local");
// `plainProjectFolderName("IES NG", "local")`: the title plus the project id's hash.
const FOLDER = "/home/runner/.t3home/projects/IES NG-9c436708";
const CHECKOUT = "/home/runner/_work/_temp/project/repository";
const repository = (canonicalKey: string) =>
  ({
    canonicalKey,
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: "x" },
  }) as unknown as RepositoryIdentity;

// The composer's project: a managed workspace with no remote, keyed by its local path.
const composer = {
  id: ProjectId.make("local"),
  title: "IES NG",
  workspaceRoot: "/Users/pj/.t3code/IES NG",
};
const projects = [
  { environmentId: LOCAL, ...composer },
  // A project the session's snapshot restored: same machine, not what the server started in.
  {
    environmentId: VM,
    id: ProjectId.make("restored"),
    workspaceRoot: "/home/runner/.t3home/projects/old",
  },
  // The project the session's server registered from its working directory.
  { environmentId: VM, id: ProjectId.make("own"), workspaceRoot: FOLDER },
];

const base = {
  target: { sessionId: "run-1", projectKey: "env-local:/Users/pj/.t3code/IES NG" },
  project: composer,
  projectKey: "env-local:/Users/pj/.t3code/IES NG",
  sessions: [{ sessionId: "run-1", environmentId: "env-vm" }],
  serverCwdOf: (environmentId: EnvironmentId) => (environmentId === VM ? `${FOLDER}/` : null),
  projects,
};
const OWN = { environmentId: VM, projectId: ProjectId.make("own") };
const withRemote = { ...composer, repositoryIdentity: repository("nexplore.ghe.com/hive/common") };

/** The session's server started in a checkout whose project carries `identity`. */
const inCheckout = (identity: RepositoryIdentity | null) => ({
  serverCwdOf: () => CHECKOUT,
  projects: [
    {
      environmentId: VM,
      id: ProjectId.make("own"),
      workspaceRoot: CHECKOUT,
      repositoryIdentity: identity,
    },
  ],
});

describe("resolveCloudSessionOwnProject", () => {
  it("is the project the session's server started in, though its key differs from the composer's", () => {
    expect(resolveCloudSessionOwnProject(base)).toEqual(OWN);
  });

  it("is the checkout of the composer's repository, also before it reports its identity", () => {
    const same = inCheckout(repository("nexplore.ghe.com/hive/common"));
    expect(resolveCloudSessionOwnProject({ ...base, project: withRemote, ...same })).toEqual(OWN);
    expect(
      resolveCloudSessionOwnProject({ ...base, project: withRemote, ...inCheckout(null) }),
    ).toEqual(OWN);
  });

  it("is none for a session started for another project, though it was picked for this one", () => {
    const other = inCheckout(repository("nexplore.ghe.com/hive/other"));
    expect(resolveCloudSessionOwnProject({ ...base, project: withRemote, ...other })).toBeNull();
    // A checkout, for a project with no remote.
    const checkout = inCheckout(repository("nexplore.ghe.com/hive/common"));
    expect(resolveCloudSessionOwnProject({ ...base, ...checkout })).toBeNull();
    // Another project's folder.
    const renamed = { ...composer, title: "Scratchpad" };
    expect(resolveCloudSessionOwnProject({ ...base, project: renamed })).toBeNull();
    // Another project with the same title: its folder carries its own id.
    const namesake = { ...composer, id: ProjectId.make("other") };
    expect(resolveCloudSessionOwnProject({ ...base, project: namesake })).toBeNull();
  });

  it("is none for a target set up for another project, or for none", () => {
    expect(resolveCloudSessionOwnProject({ ...base, projectKey: "acme/other" })).toBeNull();
    const unbound = { sessionId: "run-1", projectKey: null };
    expect(resolveCloudSessionOwnProject({ ...base, target: unbound })).toBeNull();
    expect(resolveCloudSessionOwnProject({ ...base, target: null })).toBeNull();
  });

  it("is none until the session's server is up and has registered its project", () => {
    expect(
      resolveCloudSessionOwnProject({ ...base, sessions: [{ sessionId: "run-1" }] }),
    ).toBeNull();
    expect(resolveCloudSessionOwnProject({ ...base, serverCwdOf: () => null })).toBeNull();
    const unregistered = projects.filter((project) => project.id !== ProjectId.make("own"));
    expect(resolveCloudSessionOwnProject({ ...base, projects: unregistered })).toBeNull();
  });
});

describe("logicalProjectPerEnvironment", () => {
  const sameRepository = () => true;
  // A restored checkout of the same repository at another path, listed before the session's own.
  const vmProjects = [
    { environmentId: LOCAL, id: ProjectId.make("local") },
    { environmentId: VM, id: ProjectId.make("restored") },
    { environmentId: VM, id: ProjectId.make("own") },
  ];

  it("gives the session's environment its own project, though another groups the same first", () => {
    expect(logicalProjectPerEnvironment(vmProjects, sameRepository, OWN)).toEqual([
      OWN,
      { environmentId: LOCAL, projectId: ProjectId.make("local") },
    ]);
  });

  it("keeps the first grouping project per environment when no session has its own", () => {
    expect(logicalProjectPerEnvironment(vmProjects, sameRepository, null)).toEqual([
      { environmentId: LOCAL, projectId: ProjectId.make("local") },
      { environmentId: VM, projectId: ProjectId.make("restored") },
    ]);
  });
});
