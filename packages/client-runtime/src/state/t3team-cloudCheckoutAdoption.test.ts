import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import { describe, expect, it } from "vite-plus/test";

import { buildProjectGroups, type ProjectGroupingSettings } from "./projectGrouping.ts";
import type { EnvironmentProject } from "./models.ts";
import { adoptCloudCheckoutProjects } from "./t3team-cloudCheckoutAdoption.ts";

const LOCAL = EnvironmentId.make("env-local");
const OTHER_LOCAL = EnvironmentId.make("env-local-2");
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

/** The web's rule: only the primary environment's projects count as the user's own. */
const adoptFromPrimary = (projects: ReadonlyArray<EnvironmentProject>) =>
  adoptCloudCheckoutProjects({
    projects,
    isOwnEnvironment: (environmentId) => environmentId === LOCAL,
    isCloudSessionEnvironment: (environmentId) =>
      environmentId === CLOUD || environmentId === OTHER_CLOUD,
  });

/** The phone's rule: every environment that is not the session's machine counts as the user's own. */
const adoptFromOwnEnvironments = (projects: ReadonlyArray<EnvironmentProject>) =>
  adoptCloudCheckoutProjects({
    projects,
    isOwnEnvironment: (environmentId) => environmentId !== CLOUD && environmentId !== OTHER_CLOUD,
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

  it.each([
    ["the primary environment", adoptFromPrimary],
    ["every non-session environment", adoptFromOwnEnvironments],
  ])("merges the checkout into a work-source-bound project under its name (%s)", (_rule, adopt) => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    expect(groupsOf(adopt([local, checkout]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout"] },
    ]);
  });

  it("labels a merged plain project with its own title, not the repository path", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE);
    expect(groupsOf([local, checkout])[0]?.label).not.toBe("PTI: POLAssist");
    expect(groupsOf(adoptFromPrimary([local, checkout]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout"] },
    ]);
  });

  it.each([
    ["ssh", "git@nexplore.ghe.com:hive/pti-polassist.git"],
    ["https without .git", "https://nexplore.ghe.com/hive/pti-polassist"],
    ["upper case host and path", "https://NEXPLORE.ghe.com/Hive/PTI-POLAssist.git"],
  ])("matches a local checkout whose remote is spelled as %s", (_label, localRemote) => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", localRemote);
    expect(groupsOf(adoptFromPrimary([local, checkout]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout"] },
    ]);
  });

  it("merges sessions on the same repository from several cloud environments", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const second = project(OTHER_CLOUD, "checkout-2", "repository", REMOTE);
    expect(groupsOf(adoptFromPrimary([local, checkout, second]))).toEqual([
      { label: "PTI: POLAssist", members: ["pti", "checkout", "checkout-2"] },
    ]);
  });

  it("keeps different repositories apart", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const other = project(CLOUD, "other", "repository", "https://nexplore.ghe.com/hive/other.git");
    expect(adoptFromPrimary([local, other])).toEqual([local, other]);
    expect(groupsOf(adoptFromPrimary([local, other]))).toHaveLength(2);
  });

  it("leaves a project without a remote as it was", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE);
    const bare = project(CLOUD, "bare", "repository", null);
    expect(adoptFromPrimary([local, bare])).toEqual([local, bare]);
  });

  it("does not guess between bound projects of different work sources", () => {
    const one = project(LOCAL, "a", "A", REMOTE, { source: jira });
    const two = project(LOCAL, "b", "B", REMOTE, { source: { ...jira, externalProjectId: "11" } });
    expect(adoptFromPrimary([one, two, checkout])).toEqual([one, two, checkout]);
  });

  it("only adopts checkouts of cloud session environments", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const elsewhere = project(EnvironmentId.make("env-ssh"), "ssh", "repository", REMOTE);
    expect(adoptFromPrimary([local, elsewhere])).toEqual([local, elsewhere]);
  });

  it("keeps the checkout's own environment and id so selecting it opens the session's project", () => {
    const local = project(LOCAL, "pti", "PTI: POLAssist", REMOTE, { source: jira });
    const [, adopted] = adoptFromPrimary([local, checkout]);
    expect(adopted).toMatchObject({
      environmentId: CLOUD,
      id: "checkout",
      workspaceRoot: "/work/checkout",
    });
  });

  it("returns the same list when nothing is adopted", () => {
    const projects = [project(LOCAL, "pti", "PTI: POLAssist", REMOTE)];
    expect(adoptFromPrimary(projects)).toBe(projects);
  });
});

describe("cloud checkout keeps the Jira project's identity (#999)", () => {
  // The selected project: a Jira project whose linked repository the machine checks out. The
  // machine's copy is named after the repository and carries no work-source binding.
  const selected = project(LOCAL, "nexi", "Nexi AI", "https://nexplore.ghe.com/hive/nx-nexi.git", {
    source: jira,
  });
  const machine = project(CLOUD, "machine", "nx-nexi", "https://nexplore.ghe.com/hive/nx-nexi.git");

  it("adopts the Jira project's title and work-source binding", () => {
    const [, adopted] = adoptFromOwnEnvironments([selected, machine]) as EnvironmentProject[];
    expect(adopted).toMatchObject({
      environmentId: CLOUD,
      id: "machine",
      title: "Nexi AI",
      source: jira,
      repositoryIdentity: machine.repositoryIdentity,
    });
  });

  it("the machine's scratch project is never adopted", () => {
    const scratch = project(CLOUD, "scratch", "Scratch", null, { isScratch: true });
    expect(adoptFromOwnEnvironments([selected, machine, scratch])).toHaveLength(3);
    expect(groupsOf(adoptFromOwnEnvironments([selected, machine, scratch]))).toHaveLength(2);
  });

  it("adopts from a second own environment when the first is not primary", () => {
    const elsewhere = project(
      OTHER_LOCAL,
      "nexi-b",
      "Nexi AI",
      "https://nexplore.ghe.com/hive/nx-nexi.git",
      {
        source: jira,
      },
    );
    const [, adopted] = adoptFromOwnEnvironments([elsewhere, machine]) as EnvironmentProject[];
    expect(adopted).toMatchObject({ title: "Nexi AI", source: jira });
    expect(groupsOf(adoptFromOwnEnvironments([elsewhere, machine]))).toHaveLength(1);
  });

  it("adopts nothing when no own environment has the repository", () => {
    const projects = [machine];
    expect(adoptFromOwnEnvironments(projects)).toBe(projects);
  });
});
