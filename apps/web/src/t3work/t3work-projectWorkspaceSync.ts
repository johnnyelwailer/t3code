import type { ProjectShellProject } from "@t3tools/project-context";
import {
  resolveT3WorkProjectSetupProfileId,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_CONTEXT_ROOT,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
} from "~/t3work/t3work-projectSetup";

import type { BackendApi, ProjectWorkspaceContextFile } from "~/t3work/backend/t3work-types";
import { compactJson, dedupeDirectoryBundleFiles } from "~/t3work/t3work-contextDirectoryBundle";
import { buildProjectContextEntryPoint } from "~/t3work/t3work-contextCachePaths";
import {
  buildProjectContextBundle,
  type ProjectVisibleWorkspaceContext,
} from "~/t3work/t3work-projectContextBundle";
import { isWorkProject } from "~/t3work/t3work-isWorkProject";
import type { ProjectTicket } from "~/t3work/t3work-types";
import {
  enqueueProjectWorkspaceSync,
  getProjectWorkspaceSyncStatus,
  resetProjectWorkspaceSyncQueueForTests,
  retainProjectWorkspaceSync,
} from "~/t3work/t3work-projectWorkspaceSyncQueue";

export { getProjectWorkspaceSyncStatus, retainProjectWorkspaceSync };

function buildProjectWorkspaceSyncSignature(input: {
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  visibleContext?: ProjectVisibleWorkspaceContext;
  setupProfileId: string;
}): string {
  return JSON.stringify({
    projectId: input.project.id,
    title: input.project.title,
    workspaceRoot: input.project.workspace?.rootPath ?? null,
    externalProjectId: input.project.source.externalProjectId ?? null,
    updatedAt: input.project.updatedAt,
    setupProfileId: input.setupProfileId,
    linkedRepositoryUrls: [...input.linkedRepositoryUrls].toSorted(),
    projectTickets: input.projectTickets
      ?.map((ticket) => `${ticket.id}:${ticket.ref.displayId}:${ticket.updatedAt}:${ticket.status}`)
      .toSorted(),
    visibleContext: input.visibleContext,
  });
}

export function buildProjectWorkspaceSyncFiles(input: {
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  visibleContext?: ProjectVisibleWorkspaceContext;
  setupProfileId?: string;
}): ReadonlyArray<ProjectWorkspaceContextFile> {
  const setupProfileId = resolveT3WorkProjectSetupProfileId(input.setupProfileId);
  const bundle = buildProjectContextBundle({
    project: input.project,
    linkedRepositoryUrls: input.linkedRepositoryUrls,
    ...(input.projectTickets ? { projectTickets: input.projectTickets } : {}),
    ...(input.visibleContext ? { visibleContext: input.visibleContext } : {}),
  });
  const baseEntryPoint = bundle.files.find(
    (file) => file.relativePath === T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  );
  const entryPoint = baseEntryPoint ? (JSON.parse(baseEntryPoint.contents) as object) : {};
  const files = dedupeDirectoryBundleFiles([
    ...bundle.files,
    {
      relativePath: T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
      contents: compactJson({
        ...entryPoint,
        syncedAt: new Date().toISOString(),
        profileId: setupProfileId,
        contextRoot: T3WORK_PROJECT_CONTEXT_ROOT,
        projectEntryPointPath: buildProjectContextEntryPoint(input.project.id),
        referencesManifestPath: ".t3work/references/reference-repositories.json",
        profilePath: T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
      }),
    },
  ]);

  return files.map((file) => ({
    relativePath: file.relativePath,
    contents: file.contents,
    ...(file.encoding ? { encoding: file.encoding } : {}),
  }));
}

async function runProjectWorkspaceSync(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  visibleContext?: ProjectVisibleWorkspaceContext;
  setupProfileId?: string;
  ensureBootstrap?: boolean;
}): Promise<void> {
  const workspaceRoot = input.project.workspace?.rootPath;
  if (!workspaceRoot) {
    return;
  }
  if (!isWorkProject(input.project)) {
    // Loose local workspaces are the user's own folders: never scaffold agent-instruction files
    // (AGENTS.md/CLAUDE.md) or sync work context into them. Only real work projects (Jira/Linear/
    // GitHub/managed sources) get project setup. See t3work-isWorkProject.
    return;
  }
  const setupProfileId = resolveT3WorkProjectSetupProfileId(input.setupProfileId);
  if (input.ensureBootstrap !== false) {
    await input.backend.projectWorkspace.bootstrapWorkspace({
      workspaceRoot,
      linkedRepositoryUrls: input.linkedRepositoryUrls,
      setupProfileId,
    });
  }
  await input.backend.projectWorkspace.writeContextFiles({
    workspaceRoot,
    files: buildProjectWorkspaceSyncFiles({
      project: input.project,
      linkedRepositoryUrls: input.linkedRepositoryUrls,
      ...(input.projectTickets ? { projectTickets: input.projectTickets } : {}),
      ...(input.visibleContext ? { visibleContext: input.visibleContext } : {}),
      setupProfileId,
    }),
  });
}

export function syncProjectWorkspaceContext(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  visibleContext?: ProjectVisibleWorkspaceContext;
  setupProfileId?: string;
  ensureBootstrap?: boolean;
}): Promise<void> {
  const workspaceRoot = input.project.workspace?.rootPath;
  if (!workspaceRoot) {
    return Promise.resolve();
  }

  const setupProfileId = resolveT3WorkProjectSetupProfileId(input.setupProfileId);
  const signature = buildProjectWorkspaceSyncSignature({
    project: input.project,
    linkedRepositoryUrls: input.linkedRepositoryUrls,
    ...(input.projectTickets ? { projectTickets: input.projectTickets } : {}),
    ...(input.visibleContext ? { visibleContext: input.visibleContext } : {}),
    setupProfileId,
  });
  return enqueueProjectWorkspaceSync({
    workspaceRoot,
    signature,
    run: () =>
      runProjectWorkspaceSync({
        backend: input.backend,
        project: input.project,
        linkedRepositoryUrls: input.linkedRepositoryUrls,
        ...(input.projectTickets ? { projectTickets: input.projectTickets } : {}),
        ...(input.visibleContext ? { visibleContext: input.visibleContext } : {}),
        ...(input.ensureBootstrap !== undefined ? { ensureBootstrap: input.ensureBootstrap } : {}),
        setupProfileId,
      }),
  });
}

export function resetProjectWorkspaceSyncStateForTests(): void {
  resetProjectWorkspaceSyncQueueForTests();
}
