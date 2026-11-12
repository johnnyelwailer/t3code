import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveMachineSourceTarget } from "./t3team-machineSourceTarget";

const LOCAL = EnvironmentId.make("env-local");
const CLOUD = EnvironmentId.make("env-cloud");
const REMOTE = "https://nexplore.ghe.com/acme/api.git";

const identityOf = (remoteUrl: string): RepositoryIdentity => ({
  canonicalKey: remoteUrl.replace(/^https:\/\//, "").replace(/\.git$/, ""),
  locator: { source: "git-remote", remoteName: "origin", remoteUrl },
});

const project = (
  environmentId: EnvironmentId,
  id: string,
  title: string,
  remoteUrl: string | null,
  isScratch?: true,
) => ({
  environmentId,
  id: ProjectId.make(id),
  title,
  workspaceRoot: `/work/${id}`,
  repositoryIdentity: remoteUrl === null ? null : identityOf(remoteUrl),
  ...(isScratch === undefined ? {} : { isScratch }),
});

const checkout = project(CLOUD, "checkout", "repository", REMOTE);
const target = (projects: ReadonlyArray<ReturnType<typeof project>>, owner = checkout) =>
  resolveMachineSourceTarget({
    thread: { environmentId: owner.environmentId, projectId: owner.id },
    primaryEnvironmentId: LOCAL,
    projects,
  });

describe("resolveMachineSourceTarget", () => {
  it("picks the one primary-environment project for the same repository", () => {
    const mine = project(LOCAL, "mine", "API", REMOTE);
    const other = project(LOCAL, "other", "Tools", "https://nexplore.ghe.com/acme/tools.git");
    expect(target([checkout, other, mine])).toEqual({ kind: "project", project: mine });
  });

  it("is none when the user has no project for that repository", () => {
    const other = project(LOCAL, "other", "Tools", "https://nexplore.ghe.com/acme/tools.git");
    expect(target([checkout, other])).toEqual({ kind: "none" });
  });

  it("is none for a scratch project, or when the thread's project is not listed", () => {
    const scratch = project(LOCAL, "scratch", "Scratch", REMOTE, true);
    expect(target([checkout, scratch])).toEqual({ kind: "none" });
    expect(target([project(LOCAL, "mine", "API", REMOTE)])).toEqual({ kind: "none" });
  });

  it("is ambiguous when several primary-environment projects fit, and picks none of them", () => {
    const first = project(LOCAL, "first", "API", REMOTE);
    const second = project(LOCAL, "second", "API again", REMOTE);
    expect(target([checkout, first, second])).toEqual({ kind: "ambiguous" });
  });

  it("is the thread's own project when the thread is on the primary environment", () => {
    const mine = project(LOCAL, "mine", "API", REMOTE);
    const copy = project(LOCAL, "copy", "API copy", REMOTE);
    expect(target([mine, copy], mine)).toEqual({ kind: "project", project: mine });
  });

  it("is none while the primary environment is unknown", () => {
    expect(
      resolveMachineSourceTarget({
        thread: { environmentId: CLOUD, projectId: checkout.id },
        primaryEnvironmentId: null,
        projects: [checkout, project(LOCAL, "mine", "API", REMOTE)],
      }),
    ).toEqual({ kind: "none" });
  });
});
