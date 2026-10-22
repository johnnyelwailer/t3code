import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentProject } from "./models.ts";
import { buildProjectGroups, type ProjectGroupingSettings } from "./projectGrouping.ts";
import { deriveWorkSourceProjectKey } from "./t3team-workSourceProjectKey.ts";

const laptop = EnvironmentId.make("laptop");
const desktop = EnvironmentId.make("desktop");

function repository(canonicalKey: string, rootPath: string): RepositoryIdentity {
  return {
    canonicalKey,
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: `https://${canonicalKey}` },
    rootPath,
    displayName: canonicalKey.split("/").slice(1).join("/"),
  };
}

function jira(externalProjectId: string, externalProjectKey: string) {
  return {
    provider: "atlassian" as const,
    accountId: "cloud-1",
    externalProjectId,
    externalProjectKey,
  };
}

function project(
  environmentId: EnvironmentId,
  id: string,
  title: string,
  workspaceRoot: string,
  overrides: Partial<EnvironmentProject> = {},
): EnvironmentProject {
  return {
    environmentId,
    id: ProjectId.make(id),
    title,
    workspaceRoot,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const repositoryMode: ProjectGroupingSettings = {
  sidebarProjectGroupingMode: "repository",
  sidebarProjectGroupingOverrides: {},
};

function summarize(groups: ReturnType<typeof buildProjectGroups>) {
  return groups
    .map((group) => ({
      label: group.label,
      members: group.members.map(
        (member) => `${member.project.environmentId}:${member.project.id}`,
      ),
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

describe("t3team work-source project identity across environments", () => {
  // The laptop is connected to the desktop through T3 Connect and lists both environments.
  const laptopBoard = project(
    laptop,
    "l-board",
    "Team Board",
    "/Users/me/.t3code/t3team/projects/Team Board",
    {
      source: jira("100", "TB"),
    },
  );
  const desktopBoard = project(
    desktop,
    "d-board",
    "Team Board",
    "C:\\Users\\me\\.t3code\\t3team\\projects\\Team Board",
    {
      // The desktop's project folder has a remote, the laptop's has none.
      repositoryIdentity: repository(
        "github.com/acme/app",
        "C:\\Users\\me\\.t3code\\t3team\\projects\\Team Board",
      ),
      source: jira("100", "TB"),
    },
  );
  const laptopProduct = project(
    laptop,
    "l-product",
    "Product",
    "/Users/me/.t3code/t3team/projects/Product",
    {
      source: jira("200", "PRD"),
    },
  );
  // The desktop's work project uses its main repository's checkout as workspace...
  const desktopProduct = project(
    desktop,
    "d-product",
    "Product",
    "C:\\Users\\me\\.t3code\\t3team\\projects\\Product\\.nexi\\references\\11-shared-directives",
    {
      repositoryIdentity: repository(
        "git.example.com/acme/shared-directives",
        "C:\\Users\\me\\.t3code\\t3team\\projects\\Product\\.nexi\\references\\11-shared-directives",
      ),
      source: jira("200", "PRD"),
    },
  );
  // ...and the laptop also has that repository registered as a plain project.
  const laptopDirectives = project(
    laptop,
    "l-directives",
    "shared-directives",
    "/Users/me/Dev/shared-directives",
    {
      repositoryIdentity: repository(
        "git.example.com/acme/shared-directives",
        "/Users/me/Dev/shared-directives",
      ),
    },
  );

  it("shows one entry per bound project, listing every machine it lives on", () => {
    const groups = buildProjectGroups({
      projects: [laptopBoard, laptopProduct, laptopDirectives, desktopBoard, desktopProduct],
      settings: repositoryMode,
      preferredEnvironmentId: laptop,
    });

    expect(summarize(groups)).toEqual([
      { label: "Product", members: ["laptop:l-product", "desktop:d-product"] },
      { label: "shared-directives", members: ["laptop:l-directives"] },
      { label: "Team Board", members: ["laptop:l-board", "desktop:d-board"] },
    ]);
  });

  it("never hides a remote-only bound project inside a plain project that shares its repository", () => {
    const groups = buildProjectGroups({
      projects: [laptopDirectives, desktopProduct],
      settings: repositoryMode,
      preferredEnvironmentId: laptop,
    });

    expect(summarize(groups)).toEqual([
      { label: "Product", members: ["desktop:d-product"] },
      { label: "shared-directives", members: ["laptop:l-directives"] },
    ]);
  });

  it("keeps separate mode physical", () => {
    const groups = buildProjectGroups({
      projects: [laptopBoard, desktopBoard],
      settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
      preferredEnvironmentId: laptop,
    });

    expect(groups).toHaveLength(2);
  });

  it("only keys real external bindings", () => {
    expect(deriveWorkSourceProjectKey({ source: { provider: "local" } })).toBeNull();
    expect(deriveWorkSourceProjectKey({})).toBeNull();
    expect(deriveWorkSourceProjectKey({ source: jira("100", "TB") })).toBe(
      "t3team-work-source:atlassian:cloud-1:100",
    );
    // Same Jira project id on another site is another project.
    expect(
      deriveWorkSourceProjectKey({ source: { ...jira("100", "TB"), accountId: "cloud-2" } }),
    ).not.toBe(deriveWorkSourceProjectKey({ source: jira("100", "TB") }));
  });
});
