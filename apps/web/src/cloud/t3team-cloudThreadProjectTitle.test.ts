import {
  EnvironmentId,
  plainProjectFolderName,
  ProjectId,
  type RepositoryIdentity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveCloudThreadProjectTitle } from "./t3team-cloudThreadProjectTitle";

const LOCAL = EnvironmentId.make("env-local");
const VM = EnvironmentId.make("env-vm");
const repository = (canonicalKey: string) =>
  ({
    canonicalKey,
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: "x" },
  }) as unknown as RepositoryIdentity;
const NEXI = repository("nexplore.ghe.com/hive/nx-nexi");

const project = (
  environmentId: EnvironmentId,
  id: string,
  title: string,
  repositoryIdentity: RepositoryIdentity | null,
  extra: { readonly isScratch?: true } = {},
) => ({
  environmentId,
  id: ProjectId.make(id),
  title,
  workspaceRoot: `/${id}`,
  repositoryIdentity,
  ...extra,
});

// The session's server registers its checkout directory as its project.
const checkout = project(VM, "checkout", "repository", NEXI);
const resolve = (
  active: ReturnType<typeof project>,
  projects: ReadonlyArray<ReturnType<typeof project>>,
  isCloudSession = true,
) =>
  resolveCloudThreadProjectTitle({
    project: active,
    isCloudSession,
    primaryEnvironmentId: LOCAL,
    projects,
  });

describe("resolveCloudThreadProjectTitle", () => {
  it("names a cloud thread's project after the local project of the same repository", () => {
    const local = project(LOCAL, "nexi-ai", "Nexi AI", NEXI);
    expect(resolve(checkout, [local, checkout])).toBe("Nexi AI");
  });

  it("does not rename projects outside a cloud session", () => {
    const local = project(LOCAL, "nexi-ai", "Nexi AI", NEXI);
    expect(resolve(checkout, [local, checkout], false)).toBeNull();
    expect(resolve(local, [local, checkout])).toBeNull();
  });

  it("keeps the project's own title when no local project shares its repository", () => {
    const other = project(LOCAL, "other", "Other", repository("nexplore.ghe.com/hive/other"));
    expect(resolve(checkout, [other, checkout])).toBeNull();
    expect(resolve(project(VM, "bare", "repository", null), [other])).toBeNull();
  });

  it("finds a project without a remote by the folder the session's server runs in", () => {
    // `plainProjectFolderName("IES NG", "ies")`: the title plus the project id's hash.
    const local = {
      ...project(LOCAL, "ies", "IES NG", null),
      workspaceRoot: "/Users/pj/.t3code/IES NG",
    };
    const folder = plainProjectFolderName("IES NG", local.id);
    const own = {
      ...project(VM, "own", "IES NG-1", null),
      workspaceRoot: `/home/runner/projects/${folder}`,
    };
    expect(resolve(own, [local, own])).toBe("IES NG");
    expect(resolve(checkout, [local, checkout])).toBeNull();
  });

  it("keeps the own title without a primary environment", () => {
    const local = project(LOCAL, "nexi-ai", "Nexi AI", NEXI);
    expect(
      resolveCloudThreadProjectTitle({
        project: checkout,
        isCloudSession: true,
        primaryEnvironmentId: null,
        projects: [local, checkout],
      }),
    ).toBeNull();
  });

  it("ignores scratch projects and other machines' copies", () => {
    const scratch = project(LOCAL, "scratch", "Scratch", NEXI, { isScratch: true });
    const peer = project(EnvironmentId.make("env-peer"), "peer", "Peer copy", NEXI);
    expect(resolve(checkout, [scratch, peer, checkout])).toBeNull();
  });

  it("takes the title when several local projects share it, and nothing when they disagree", () => {
    const a = project(LOCAL, "a", "Nexi AI", NEXI);
    const b = project(LOCAL, "b", "Nexi AI", NEXI);
    const c = project(LOCAL, "c", "Nexi docs", NEXI);
    expect(resolve(checkout, [a, b, checkout])).toBe("Nexi AI");
    expect(resolve(checkout, [a, c, checkout])).toBeNull();
  });
});
