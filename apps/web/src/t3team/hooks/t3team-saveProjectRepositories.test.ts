import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectStateMigration } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describeProjectStateMigration } from "~/t3team/components/t3team-ProjectStateMigrationStatusLine";
import type { BackendApi, ProjectWorkspaceBootstrapResult } from "~/t3team/backend/t3team-types";
import { readLinkedRepositoryUrlsFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { saveProjectRepositoriesOptimistically } from "~/t3team/hooks/t3team-saveProjectRepositories";

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const HOME = "/tmp/home";

const project = {
  id: "project-1",
  title: "Project",
  source: {
    provider: "atlassian",
    raw: { agentReferences: { linkedRepositories: [{ url: ALPHA }] } },
  },
  workspace: { rootPath: HOME, createdAt: "2026-01-01T00:00:00.000Z" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as ProjectShellProject;

const bootstrap: ProjectWorkspaceBootstrapResult = {
  workspaceRoot: HOME,
  workspaceRepositoryInitialized: false,
  referencesRoot: `${HOME}/.t3team/references`,
  linkedRepositories: [
    { url: ALPHA, localPath: `${HOME}/.t3team/references/01-alpha`, status: "cloned" },
    { url: BETA, localPath: `${HOME}/.t3team/references/02-beta`, status: "pending" },
  ],
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

const backendWith = (bootstrapWorkspace: () => Promise<ProjectWorkspaceBootstrapResult>) =>
  ({
    projectWorkspace: {
      bootstrapWorkspace,
      setMainRepository: vi.fn(async () => ({ changed: false })),
    },
  }) as unknown as BackendApi;

describe("saveProjectRepositoriesOptimistically", () => {
  it("shows the new linked repositories before the server answers, then reconciles", async () => {
    const pending = deferred<ProjectWorkspaceBootstrapResult>();
    const published: ProjectShellProject[] = [];
    const saving = saveProjectRepositoriesOptimistically({
      backend: backendWith(() => pending.promise),
      project,
      linkedRepositoryUrls: [ALPHA, BETA],
      mainRepositoryUrl: null,
      onProjectUpdated: (next) => published.push(next),
    });

    expect(published).toHaveLength(1);
    expect(readLinkedRepositoryUrlsFromProject(published[0]!)).toEqual([ALPHA, BETA]);

    pending.resolve(bootstrap);
    const saved = await saving;
    expect(published.at(-1)).toBe(saved);
    expect(readLinkedRepositoryUrlsFromProject(saved)).toEqual([ALPHA, BETA]);
  });

  it("rolls back to the original project when the save fails", async () => {
    const pending = deferred<ProjectWorkspaceBootstrapResult>();
    const published: ProjectShellProject[] = [];
    const saving = saveProjectRepositoriesOptimistically({
      backend: backendWith(() => pending.promise),
      project,
      linkedRepositoryUrls: [ALPHA, BETA],
      mainRepositoryUrl: null,
      onProjectUpdated: (next) => published.push(next),
    });
    pending.reject(new Error("disk full"));

    await expect(saving).rejects.toThrow("disk full");
    expect(published.at(-1)).toBe(project);
    expect(readLinkedRepositoryUrlsFromProject(published.at(-1)!)).toEqual([ALPHA]);
  });
});

describe("describeProjectStateMigration", () => {
  const migration = (overrides: Partial<ProjectStateMigration>): ProjectStateMigration => ({
    migrationId: "m-1",
    status: "running",
    fromRoot: HOME,
    toRoot: `${HOME}/.t3team/references/01-alpha`,
    stateDir: ".t3team",
    excludes: [],
    startedAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
    ...overrides,
  });

  it("reports progress, the conflict count and the failure reason", () => {
    expect(describeProjectStateMigration(migration({ missingFilesAtLeast: 50_000 }))).toEqual({
      tone: "progress",
      label: "Moving the project state in the “Migrate project state” thread",
      detail: "at least 50,000 files",
    });
    expect(
      describeProjectStateMigration(migration({ status: "completed", conflicts: 2 })),
    ).toMatchObject({
      tone: "ready",
      detail: "2 conflicting files kept the main repository's version",
    });
    expect(
      describeProjectStateMigration(
        migration({ status: "failed", error: "The migration run was cancelled." }),
      ),
    ).toEqual({
      tone: "error",
      label: "Moving the project state failed",
      detail: "The migration run was cancelled.",
    });
  });
});
