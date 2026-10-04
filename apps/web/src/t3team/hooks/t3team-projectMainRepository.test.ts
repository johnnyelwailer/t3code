import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";
import type {
  BackendApi,
  ProjectMainRepositorySwitchResult,
  ProjectWorkspaceBootstrapResult,
} from "~/t3team/backend/t3team-types";
import {
  applyWorkspaceBootstrapToProject,
  readLinkedRepositoryUrlsFromProject,
  replaceLinkedRepositoryUrlsInProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  applyMainRepositoryAutoDetection,
  applyMainRepositorySwitchToProject,
  readMainRepositoryFromProject,
} from "~/t3team/hooks/t3team-projectMainRepository";

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const HOME = "/tmp/home";
const ALPHA_CHECKOUT = `${HOME}/.t3team/references/01-alpha`;

const project = (raw: unknown = { agentReferences: { linkedRepositories: [] } }) =>
  ({
    id: "project-1",
    title: "Project",
    source: { provider: "atlassian", raw },
    workspace: { rootPath: HOME, createdAt: "2026-01-01T00:00:00.000Z" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as ProjectShellProject;

const bootstrap = (
  overrides: Partial<ProjectWorkspaceBootstrapResult> = {},
): ProjectWorkspaceBootstrapResult => ({
  workspaceRoot: HOME,
  workspaceRepositoryInitialized: false,
  referencesRoot: `${HOME}/.t3team/references`,
  linkedRepositories: [
    { url: ALPHA, localPath: ALPHA_CHECKOUT, status: "cloned" },
    { url: BETA, localPath: `${HOME}/.t3team/references/02-beta`, status: "cloned" },
  ],
  ...overrides,
});

const switched: ProjectMainRepositorySwitchResult = {
  changed: true,
  workspaceRoot: ALPHA_CHECKOUT,
  mainRepository: {
    url: ALPHA,
    checkoutPath: ALPHA_CHECKOUT,
    projectRoot: HOME,
    selection: "detected",
  },
  migratedPaths: ["context/entrypoint.json"],
};

const backendWith = (setMainRepository: ReturnType<typeof vi.fn>) =>
  ({ projectWorkspace: { setMainRepository } }) as unknown as BackendApi;

describe("project main repository (client)", () => {
  it("re-roots the project on the main repository's checkout", () => {
    const next = applyMainRepositorySwitchToProject(
      applyWorkspaceBootstrapToProject(project(), bootstrap()),
      switched,
    );
    expect(next.workspace?.rootPath).toBe(ALPHA_CHECKOUT);
    expect(readMainRepositoryFromProject(next)).toEqual({
      url: ALPHA,
      localPath: ALPHA_CHECKOUT,
      status: "detected",
    });
    expect(readLinkedRepositoryUrlsFromProject(next)).toEqual([ALPHA, BETA]);
  });

  it("auto-selects the single candidate that already carries project state", async () => {
    const setMainRepository = vi.fn(async () => switched);
    const next = await applyMainRepositoryAutoDetection({
      backend: backendWith(setMainRepository),
      project: project(),
      bootstrap: bootstrap({
        mainRepositoryCandidates: [{ url: ALPHA, checkoutPath: ALPHA_CHECKOUT }],
      }),
    });
    expect(setMainRepository).toHaveBeenCalledWith({
      projectId: "project-1",
      url: ALPHA,
      selection: "detected",
    });
    expect(next.workspace?.rootPath).toBe(ALPHA_CHECKOUT);
  });

  it("leaves several candidates to the user, and keeps the project when a switch fails", async () => {
    const setMainRepository = vi.fn(async () => {
      throw new Error("refused");
    });
    const several = await applyMainRepositoryAutoDetection({
      backend: backendWith(setMainRepository),
      project: project(),
      bootstrap: bootstrap({
        mainRepositoryCandidates: [
          { url: ALPHA, checkoutPath: ALPHA_CHECKOUT },
          { url: BETA, checkoutPath: `${HOME}/.t3team/references/02-beta` },
        ],
      }),
    });
    expect(setMainRepository).not.toHaveBeenCalled();
    expect(several.workspace?.rootPath).toBe(HOME);

    const failed = await applyMainRepositoryAutoDetection({
      backend: backendWith(setMainRepository),
      project: project(),
      bootstrap: bootstrap({
        mainRepositoryCandidates: [{ url: ALPHA, checkoutPath: ALPHA_CHECKOUT }],
      }),
    });
    expect(failed.workspace?.rootPath).toBe(HOME);
  });

  it("keeps the main repository when the linked list is rebuilt", () => {
    const rooted = applyMainRepositorySwitchToProject(project(), switched);
    const relinked = replaceLinkedRepositoryUrlsInProject(rooted, [ALPHA, BETA]);
    expect(readMainRepositoryFromProject(relinked)?.url).toBe(ALPHA);
  });

  it("keeps the main repository in the linked list after a bootstrap of its own checkout", () => {
    const rooted = applyMainRepositorySwitchToProject(
      applyWorkspaceBootstrapToProject(project(), bootstrap()),
      switched,
    );
    const rebooted = applyWorkspaceBootstrapToProject(
      rooted,
      bootstrap({
        workspaceRoot: ALPHA_CHECKOUT,
        linkedRepositories: [
          { url: BETA, localPath: `${HOME}/.t3team/references/02-beta`, status: "updated" },
        ],
        mainRepository: { url: ALPHA, localPath: ALPHA_CHECKOUT, status: "detected" },
      }),
    );
    expect(readLinkedRepositoryUrlsFromProject(rebooted)).toEqual([ALPHA, BETA]);
  });
});
