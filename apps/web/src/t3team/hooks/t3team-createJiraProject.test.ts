// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import type { ExternalProject } from "@t3tools/integrations-core";

import type { BackendApi } from "~/t3team/backend/t3team-types";

import { writeIntegrationCache } from "./t3team-integrationCache";
import { atlassianProjectsCacheKey } from "./t3team-jiraProjectCatalog.logic";

const { mockCreate, mockFinalize } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFinalize: vi.fn(),
}));

vi.mock("~/t3team/t3team-mock-adapter", () => ({
  t3teamCreateProject: (input: unknown) => Effect.succeed(mockCreate(input)),
}));
vi.mock("./t3team-createProjectFinalization", () => ({
  finalizeCreatedProject: (input: unknown) => Promise.resolve(mockFinalize(input)),
}));

import { createJiraProject, resolveJiraExternalProject } from "./t3team-createJiraProject";

const entry = {
  entryKey: "site-a::10001",
  accountId: "site-a",
  provider: "atlassian",
  externalProjectId: "10001",
  key: "IES",
  title: "IES NG",
  iconUrl: undefined,
  siteHost: "nexplore.atlassian.net",
};
const external: ExternalProject = {
  id: "10001",
  provider: "atlassian",
  title: "IES NG",
  key: "IES",
  url: "https://nexplore.atlassian.net/browse/IES",
  raw: { avatarColor: "#123456" },
};

const backendWith = (projects: ReadonlyArray<ExternalProject>) => {
  const listProjects = vi.fn(async () => projects);
  return { backend: { atlassian: { listProjects } } as unknown as BackendApi, listProjects };
};

const projectsCacheKey = atlassianProjectsCacheKey({ id: "site-a", provider: "atlassian" });

beforeEach(() => {
  // The in-memory cache outlives `localStorage.clear()`, so each test starts from an empty list.
  writeIntegrationCache(projectsCacheKey, []);
  mockCreate.mockReset();
  mockFinalize.mockReset();
});

describe("resolveJiraExternalProject", () => {
  it("reads the cached per-site list without asking Jira", async () => {
    writeIntegrationCache(projectsCacheKey, [external]);
    const { backend, listProjects } = backendWith([]);
    await expect(resolveJiraExternalProject(backend, entry)).resolves.toEqual(external);
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("falls back to Jira when the cache does not have the project", async () => {
    const { backend, listProjects } = backendWith([external]);
    await expect(resolveJiraExternalProject(backend, entry)).resolves.toEqual(external);
    expect(listProjects).toHaveBeenCalledWith({ id: "site-a", provider: "atlassian" });
  });

  it("says so when the project is gone", async () => {
    const { backend } = backendWith([]);
    await expect(resolveJiraExternalProject(backend, entry)).rejects.toThrow(/no longer available/);
  });
});

describe("createJiraProject", () => {
  it("binds the project to the site and project it was chosen from, with its repositories", async () => {
    mockCreate.mockReturnValue({ id: "p1" });
    mockFinalize.mockReturnValue({ id: "p1", finalized: true });
    const { backend } = backendWith([external]);

    const project = await createJiraProject({
      backend,
      entry,
      linkedRepositoryUrls: [" https://github.com/acme/api ", "https://github.com/acme/api", ""],
      setupProfileId: "product-partner",
    });

    expect(project).toEqual({ id: "p1", finalized: true });
    const created = mockCreate.mock.calls[0]![0] as Record<string, any>;
    expect(created).toMatchObject({
      title: "IES NG",
      sourceProvider: "atlassian",
      accountId: "site-a",
      externalProjectId: "10001",
      externalProjectKey: "IES",
    });
    expect(created.raw.agentReferences.linkedRepositories).toEqual([
      { url: "https://github.com/acme/api" },
    ]);
    expect(mockFinalize.mock.calls[0]![0]).toMatchObject({
      linkedRepositoryUrls: ["https://github.com/acme/api"],
      setupProfileId: "product-partner",
    });
  });

  it("passes a custom profile through to the workspace setup", async () => {
    mockCreate.mockReturnValue({ id: "p1" });
    const { backend } = backendWith([external]);
    const customProfile = { id: "mine", title: "Mine" } as never;
    await createJiraProject({
      backend,
      entry,
      linkedRepositoryUrls: [],
      setupProfileId: "mine",
      customProfile,
    });
    expect(mockFinalize.mock.calls[0]![0].customProfile).toBe(customProfile);
  });

  it("notifies the caller as soon as the record exists, before workspace setup finishes", async () => {
    const record = { id: "p1", workspace: { rootPath: "/tmp/p1" } };
    mockCreate.mockReturnValue(record);
    let finishFinalize: (project: unknown) => void = () => {};
    mockFinalize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishFinalize = resolve;
        }),
    );
    const onRecordCreated = vi.fn();
    writeIntegrationCache(projectsCacheKey, [external]);
    const { backend } = backendWith([]);
    const pending = createJiraProject({
      backend,
      entry,
      linkedRepositoryUrls: [
        "https://github.com/hive/MILO5",
        "https://github.com/hive/milo5-agentic",
        "https://github.com/hive/milo5-mocks",
        "https://github.com/hive/milo5-ops",
      ],
      setupProfileId: "product-partner",
      onRecordCreated,
    });
    // Flush Effect.runPromise so the record is created; finalize is still outstanding.
    await vi.waitFor(() => expect(onRecordCreated).toHaveBeenCalledWith(record));
    expect(mockFinalize).toHaveBeenCalled();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finishFinalize({ ...record, finalized: true });
    await expect(pending).resolves.toEqual({ ...record, finalized: true });
  });
});
