import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  narrowEnvironmentIds,
  narrowGroupsToEnvironment,
  narrowScopeKeysToEnvironment,
  projectScopeKeysInEnvironment,
  sidebarEnvironmentFilter,
  sidebarEnvironmentFilterCandidates,
} from "./t3team-sidebarEnvironmentFilter.logic";

const identities = [
  { environmentId: "local", label: "NX-MN94KQCLWQ" },
  { environmentId: "cloud", label: "Cloud session" },
  { environmentId: "idle", label: "Idle server" },
];
const group = (projectKey: string, ...environmentIds: string[]) => ({
  projectKey,
  memberProjectRefs: environmentIds.map((environmentId) => ({ environmentId })),
});
const live = { archivedAt: null };

describe("sidebarEnvironmentFilterCandidates", () => {
  const base = { identities, primaryEnvironmentId: "local", threads: [], pickableGroups: [] };

  it("lists only environments that have a thread or a project in the list", () => {
    const candidates = sidebarEnvironmentFilterCandidates({
      ...base,
      threads: [{ environmentId: "cloud", ...live }],
      pickableGroups: [group("a", "local")],
    });
    expect(candidates.map((candidate) => candidate.id)).toEqual(["local", "cloud"]);
  });

  it("ignores archived threads", () => {
    const candidates = sidebarEnvironmentFilterCandidates({
      ...base,
      threads: [{ environmentId: "cloud", archivedAt: "2026-11-01T00:00:00.000Z" }],
      pickableGroups: [group("a", "local")],
    });
    expect(candidates.map((candidate) => candidate.id)).toEqual(["local"]);
  });

  it("marks the primary and drops catalog entries the list never mentions", () => {
    const candidates = sidebarEnvironmentFilterCandidates({
      ...base,
      threads: [{ environmentId: "ghost", ...live }],
      pickableGroups: [group("a", "local", "cloud")],
    });
    expect(candidates.map((candidate) => [candidate.id, candidate.isPrimary])).toEqual([
      ["local", true],
      ["cloud", false],
    ]);
  });
});

describe("the primary environment's label", () => {
  const input = {
    identities,
    primaryEnvironmentId: "local",
    threads: [{ environmentId: "cloud", archivedAt: null }],
    pickableGroups: [group("a", "local")],
  };
  const labelOfPrimary = () =>
    sidebarEnvironmentFilterCandidates(input).find((candidate) => candidate.isPrimary)?.label;

  afterEach(() => vi.unstubAllGlobals());

  it("reads 'This computer' in the desktop app, whatever the hostname", () => {
    vi.stubGlobal("window", { desktopBridge: {}, location: { hostname: "example.com" } });
    expect(labelOfPrimary()).toBe("This computer");
  });

  it("keeps a network server's own label in a browser that is not on its machine", () => {
    vi.stubGlobal("window", { location: { hostname: "build.example.com" } });
    expect(labelOfPrimary()).toBe("NX-MN94KQCLWQ");
  });
});

describe("sidebarEnvironmentFilter hide rule", () => {
  const candidate = (id: string, isPrimary = false) => ({ id, label: id, isPrimary });

  it("is hidden when only the primary environment lists anything", () => {
    expect(sidebarEnvironmentFilter([candidate("local", true)], null).pills).toBeNull();
  });

  it("shows once a second environment lists something", () => {
    const { pills } = sidebarEnvironmentFilter(
      [candidate("local", true), candidate("cloud")],
      null,
    );
    expect(pills?.map((pill) => pill.id)).toEqual([null, "local", "cloud"]);
  });

  it("reads a stored selection of a vanished environment as All", () => {
    expect(sidebarEnvironmentFilter([candidate("local", true)], "cloud").selectedId).toBeNull();
  });
});

describe("narrowScopeKeysToEnvironment", () => {
  const projects = [
    { environmentId: "local", id: "p1" },
    { environmentId: "cloud", id: "p2" },
    { environmentId: "cloud", id: "p3" },
  ];

  it("leaves the scope alone with no environment selected", () => {
    const keys = new Set(["local:p1"]);
    expect(narrowScopeKeysToEnvironment(keys, null, projects)).toBe(keys);
    expect(narrowScopeKeysToEnvironment(null, null, projects)).toBeNull();
  });

  it("scopes all projects to the environment when no project is chosen", () => {
    expect([...narrowScopeKeysToEnvironment(null, "cloud", projects)!]).toEqual([
      "cloud:p2",
      "cloud:p3",
    ]);
  });

  it("cuts a project scope down to the environment's projects", () => {
    const keys = new Set(["local:p1", "cloud:p2"]);
    expect([...narrowScopeKeysToEnvironment(keys, "cloud", projects)!]).toEqual(["cloud:p2"]);
  });

  it("is empty for an environment with no project, not everything", () => {
    expect(narrowScopeKeysToEnvironment(null, "idle", projects)?.size).toBe(0);
  });
});

describe("group and id narrowing", () => {
  const groups = [group("a", "local"), group("b", "local", "cloud"), group("c", "cloud")];

  it("keeps the groups that have a project in the environment", () => {
    expect(narrowGroupsToEnvironment(groups, "cloud").map((g) => g.projectKey)).toEqual(["b", "c"]);
    expect(narrowGroupsToEnvironment(groups, null)).toBe(groups);
  });

  it("drops project scope keys that have no project in the environment", () => {
    expect(projectScopeKeysInEnvironment(groups, ["a", "b"], "cloud")).toEqual(["b"]);
    expect(projectScopeKeysInEnvironment(groups, ["a"], "cloud")).toEqual([]);
    expect(projectScopeKeysInEnvironment(groups, ["a"], null)).toEqual(["a"]);
  });

  it("limits the searched environments", () => {
    expect(narrowEnvironmentIds(["local", "cloud"], "cloud")).toEqual(["cloud"]);
    expect(narrowEnvironmentIds(["local", "cloud"], null)).toEqual(["local", "cloud"]);
  });
});
