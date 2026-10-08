import type { ProjectShellProject } from "@t3tools/project-context";
import {
  resolveT3TeamProjectSetupProfileId,
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
  T3TEAM_PROJECT_REFERENCES_MANIFEST_PATH,
} from "~/t3team/t3team-projectSetup";

import type { BackendApi, ProjectWorkspaceContextFile } from "~/t3team/backend/t3team-types";
import { compactJson, dedupeDirectoryBundleFiles } from "~/t3team/t3team-contextDirectoryBundle";
import { buildProjectContextEntryPoint } from "~/t3team/t3team-contextCachePaths";
import {
  buildProjectContextBundle,
  type ProjectVisibleWorkspaceContext,
} from "~/t3team/t3team-projectContextBundle";
import { isWorkProject } from "~/t3team/t3team-isWorkProject";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  enqueueProjectWorkspaceSync,
  getProjectWorkspaceSyncStatus,
  resetProjectWorkspaceSyncQueueForTests,
  retainProjectWorkspaceSync,
} from "~/t3team/t3team-projectWorkspaceSyncQueue";

export { getProjectWorkspaceSyncStatus, retainProjectWorkspaceSync };

/** The bootstrap inputs each workspace was last bootstrapped with. Context syncs re-run whenever
 * tickets or visible context change (every few seconds while a project is open); bootstrapping
 * — scaffolding and queueing linked-repository syncs — only needs to re-run when these change. */
const bootstrappedKeyByWorkspaceRoot = new Map<string, string>();

const buildBootstrapKey = (linkedRepositoryUrls: ReadonlyArray<string>, setupProfileId: string) =>
  JSON.stringify({ setupProfileId, linkedRepositoryUrls: [...linkedRepositoryUrls].toSorted() });

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
  const setupProfileId = resolveT3TeamProjectSetupProfileId(input.setupProfileId);
  const bundle = buildProjectContextBundle({
    project: input.project,
    linkedRepositoryUrls: input.linkedRepositoryUrls,
    ...(input.projectTickets ? { projectTickets: input.projectTickets } : {}),
    ...(input.visibleContext ? { visibleContext: input.visibleContext } : {}),
  });
  const baseEntryPoint = bundle.files.find(
    (file) => file.relativePath === T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  );
  const entryPoint = baseEntryPoint ? (JSON.parse(baseEntryPoint.contents) as object) : {};
  const files = dedupeDirectoryBundleFiles([
    ...bundle.files,
    {
      relativePath: T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
      contents: compactJson({
        ...entryPoint,
        syncedAt: new Date().toISOString(),
        profileId: setupProfileId,
        contextRoot: T3TEAM_PROJECT_CONTEXT_ROOT,
        projectEntryPointPath: buildProjectContextEntryPoint(input.project.id),
        referencesManifestPath: T3TEAM_PROJECT_REFERENCES_MANIFEST_PATH,
        profilePath: T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
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
    // GitHub/managed sources) get project setup. See t3team-isWorkProject.
    return;
  }
  const setupProfileId = resolveT3TeamProjectSetupProfileId(input.setupProfileId);
  const bootstrapKey = buildBootstrapKey(input.linkedRepositoryUrls, setupProfileId);
  if (
    input.ensureBootstrap !== false &&
    bootstrappedKeyByWorkspaceRoot.get(workspaceRoot) !== bootstrapKey
  ) {
    await input.backend.projectWorkspace.bootstrapWorkspace({
      workspaceRoot,
      linkedRepositoryUrls: input.linkedRepositoryUrls,
      setupProfileId,
    });
    bootstrappedKeyByWorkspaceRoot.set(workspaceRoot, bootstrapKey);
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

  const setupProfileId = resolveT3TeamProjectSetupProfileId(input.setupProfileId);
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
  bootstrappedKeyByWorkspaceRoot.clear();
  resetProjectWorkspaceSyncQueueForTests();
}
