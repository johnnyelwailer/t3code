/**
 * Client side of the project main repository: reading it from a shell project, applying a
 * server switch (the workspace root moves to the main repository's checkout), and the
 * auto-detection rule — exactly one linked clone carrying a project state dir becomes the main
 * repository; several are left for the user to pick. The server refuses a detected switch over
 * an explicit user choice, so detection never overrides the user.
 */
import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type {
  BackendApi,
  ProjectMainRepositorySwitchResult,
  ProjectWorkspaceBootstrapResult,
} from "~/t3team/backend/t3team-types";
import type {
  MainRepositoryReference,
  ProjectAgentReferences,
} from "~/t3team/hooks/t3team-createProjectBootstrap";

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readAgentReferences(project: ProjectShellProject): Partial<ProjectAgentReferences> {
  return readRecord(readRecord(project.source.raw).agentReferences);
}

export function readMainRepositoryFromProject(
  project: ProjectShellProject,
): MainRepositoryReference | undefined {
  const mainRepository = readAgentReferences(project).mainRepository;
  return typeof readRecord(mainRepository).localPath === "string" ? mainRepository : undefined;
}

export function readMainRepositoryCandidatesFromProject(
  project: ProjectShellProject,
): ReadonlyArray<ProjectMainRepositoryCandidate> {
  const candidates = readAgentReferences(project).mainRepositoryCandidates;
  return Array.isArray(candidates) ? candidates : [];
}

/** Re-roots the shell project on the switched workspace and records the new main repository. */
export function applyMainRepositorySwitchToProject(
  project: ProjectShellProject,
  result: ProjectMainRepositorySwitchResult,
): ProjectShellProject {
  const raw = readRecord(project.source.raw);
  const {
    mainRepository: _previous,
    mainRepositoryCandidates: _candidates,
    ...references
  } = readAgentReferences(project);
  const main = result.mainRepository;
  const mainRepository: MainRepositoryReference | undefined = main?.url
    ? { url: main.url, localPath: main.checkoutPath, status: main.selection ?? "user" }
    : undefined;
  return {
    ...project,
    workspace: {
      createdAt: project.workspace?.createdAt ?? project.createdAt,
      rootPath: result.workspaceRoot,
    },
    source: {
      ...project.source,
      raw: {
        ...raw,
        agentReferences: {
          linkedRepositories: [],
          ...references,
          ...(mainRepository ? { mainRepository } : {}),
        },
      },
    },
  };
}

/** Applies auto-detection after a bootstrap. Best-effort: a failed switch keeps the project. */
export async function applyMainRepositoryAutoDetection(input: {
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  readonly bootstrap: ProjectWorkspaceBootstrapResult;
}): Promise<ProjectShellProject> {
  const candidates = input.bootstrap.mainRepositoryCandidates ?? [];
  const detected = candidates.length === 1 ? candidates[0] : undefined;
  if (!detected) return input.project;
  try {
    const result = await input.backend.projectWorkspace.setMainRepository({
      projectId: input.project.id,
      url: detected.url,
      selection: "detected",
    });
    return result.changed
      ? applyMainRepositorySwitchToProject(input.project, result)
      : input.project;
  } catch {
    return input.project;
  }
}
