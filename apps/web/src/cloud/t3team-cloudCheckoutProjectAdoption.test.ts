import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import {
  buildProjectGroups,
  type ProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import { describe, expect, it } from "vite-plus/test";

import { adoptCloudCheckoutProjects } from "./t3team-cloudCheckoutProjectAdoption";

const LOCAL = EnvironmentId.make("env-local");
const CLOUD = EnvironmentId.make("env-cloud");
const OTHER_CLOUD = EnvironmentId.make("env-cloud-2");

const identityOf = (remoteUrl: string): RepositoryIdentity => ({
  canonicalKey: normalizeGitRemoteUrl(remoteUrl),
  locator: { source: "git-remote", remoteName: "origin", remoteUrl },
  displayName: normalizeGitRemoteUrl(remoteUrl).split("/").slice(1).join("/"),
});

const project = (
  environmentId: EnvironmentId,
  id: string,
  title: string,
  remoteUrl: string | null,
  overrides: Partial<EnvironmentProject> = {},
): EnvironmentProject => ({
  environmentId,
  id: ProjectId.make(id),
  title,
  workspaceRoot: `/work/${id}`,
  repositoryIdentity: remoteUrl === null ? null : identityOf(remoteUrl),
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const settings: ProjectGroupingSettings = {
  sidebarProjectGroupingMode: "repository",
  sidebarProjectGroupingOverrides: {},
};
const jira = {
  provider: "atlassian" as const,
  accountId: "c1",
  externalProjectId: "10",
  externalProjectKey: "PTI",
};

const REMOTE = "https://nexplore.ghe.com/hive/pti-polassist.git";
const groupsOf = (projects: ReadonlyArray<EnvironmentProject>) =>
  buildProjectGroups({ projects, settings, preferredEnvironmentId: LOCAL }).map((group) => ({
    label: group.label,
    members: group.members.map((member) => member.project.id as string),
  }));
const adopt = (projects: ReadonlyArray<EnvironmentProject>) =>
  adoptCloudCheckoutProjects({
    projects,
    primaryEnvironmentId: LOCAL,
    isCloudSessionEnvironment: (environmentId) =>
      environmentId === CLOUD || environmentId === OTHER_CLOUD,
  });

describe("cloud checkout joins the user's project (#777)", () => {
  // The checkout the session's server registers: named after the runner folder, no work source.
  const checkout = project(CLOUD, "checkout", "repository", REMOTE);

  it("splits a work-source-bound project from its cloud checkout without adoption", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    expect(groupsOf([local, checkout])).toEqual([
      { label: "PTI: POLAssist", members: ["pti"] },
      { label: "repository", members: ["checkout"] },
    ]);
  });

  it("merges the checkout into a work-source-bound project under its name", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    expect(groupsOf(adopt([local, checkout]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout"] },
    ]);
  });

  it("labels a merged plain project with its own title, not the repository path", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE);
    expect(groupsOf([local, checkout])[0]?.label).not.toBe("PTI: POLAssist");
    expect(groupsOf(adopt([local, checkout]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout"] },
    ]);
  });

  it.each([
    ["ssh", "git@nexplore.ghe.com:hive/pti-polassist.git"],
    ["https without .git", "https://nexplore.ghe.com/hive/pti-polassist"],
    ["upper case host and path", "https://NEXPLORE.ghe.com/Hive/PTI-POLAssist.git"],
  ])("matches a local checkout whose remote is spelled as %s", (_label, localRemote) => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", localRemote);
    expect(groupsOf(adopt([local, checkout]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout"] },
    ]);
  });

  it("merges sessions on the same repository from several cloud environments", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const second = project(OTHER_CLOUD, "checkout-2", "repository", REMOTE);
    expect(groupsOf(adopt([local, checkout, second]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout", "checkout-2"] },
    ]);
  });

  it("keeps different repositories apart", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const other = project(CLOUD, "other", "repository", "https://nexplore.ghe.com/hive/other.git");
    expect(adopt([local, other])).toEqual([local, other]);
    expect(groupsOf(adopt([local, other]))).toHaveLength(2);
  });

  it("leaves a project without a remote as it was", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE);
    const bare = project(CLOUD, "bare", "repository", null);
    expect(adopt([local, bare])).toEqual([local, bare]);
  });

  it("does not guess between bound projects of different work sources", () => {
    const one = project(LOCAL, "a", "A", REMOTE, { source: jira });
    const two = project(LOCAL, "b", "B", REMOTE, { source: { ...jira, externalProjectId: "11" } });
    expect(adopt([one, two, checkout])).toEqual([one, two, checkout]);
  });

  it("only adopts checkouts of cloud session environments", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const elsewhere = project(EnvironmentId.make("env-ssh"), "ssh", "repository", REMOTE);
    expect(adopt([local, elsewhere])).toEqual([local, elsewhere]);
  });

  it("keeps the checkout's own environment and id so selecting it opens the session's project", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const [, adopted] = adopt([local, checkout]);
    expect(adopted).toMatchObject({
      environmentId: CLOUD,
      id: "checkout",
      workspaceRoot: "/work/checkout",
    });
  });

  it("returns the same list when nothing is adopted", () => {
    const projects = [project(LOCAL, "pti", "PTI: POLAssist", REMOTE)];
    expect(adopt(projects)).toBe(projects);
  });
});
