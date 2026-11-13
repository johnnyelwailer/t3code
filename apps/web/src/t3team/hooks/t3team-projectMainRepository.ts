/**
 * Client side of the project main repository: reading it from a shell project, applying a
 * server switch (the workspace root moves to the main repository's checkout), and the
 * auto-detection rule — exactly one state-dir candidate, or otherwise exactly one linked
 * repository (even with no state dir yet), becomes the main workspace. Several candidates or
 * several linked repositories are left for the user to pick. The server refuses a detected
 * switch over an explicit user choice, so detection never overrides the user.
 */
import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type {
  BackendApi,
  ProjectMainRepositorySwitchResult,
  ProjectWorkspaceBootstrapResult,
} from "~/t3team/backend/t3team-types";
import { waitForLinkedRepositoryReady } from "~/t3team/hooks/t3team-waitForLinkedRepositoryReady";
import {
  readLinkedRepositoryUrlsFromProject,
  type MainRepositoryReference,
  type ProjectAgentReferences,
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

/**
 * The URL auto-detection should switch to, if any. Exactly one state-dir candidate wins
 * (existing rule). Otherwise exactly one linked repository becomes the main workspace even
 * when it has no state dir yet. An explicit user (or adopted) main is never overridden.
 */
export function detectMainRepositoryUrl(input: {
  readonly candidates: ReadonlyArray<{ readonly url: string }>;
  readonly linkedUrls: ReadonlyArray<string>;
  readonly existingMain?: { readonly status?: string } | undefined;
}): string | undefined {
  const status = input.existingMain?.status;
  if (status === "user" || status === "adopted") return undefined;
  if (input.candidates.length === 1) return input.candidates[0]?.url;
  if (input.candidates.length > 1) return undefined;
  return input.linkedUrls.length === 1 ? input.linkedUrls[0] : undefined;
}

/** Applies auto-detection after a bootstrap: clones the one detected repository, then switches
 * to it. Best-effort: a failed clone or switch keeps the project. */
export async function applyMainRepositoryAutoDetection(input: {
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  readonly bootstrap: ProjectWorkspaceBootstrapResult;
}): Promise<ProjectShellProject> {
  const candidates = input.bootstrap.mainRepositoryCandidates ?? [];
  const linkedFromBootstrap = (input.bootstrap.linkedRepositories ?? []).map((entry) => entry.url);
  const linkedUrls =
    linkedFromBootstrap.length > 0
      ? linkedFromBootstrap
      : readLinkedRepositoryUrlsFromProject(input.project);
  const detectedUrl = detectMainRepositoryUrl({
    candidates,
    linkedUrls,
    existingMain: readMainRepositoryFromProject(input.project),
  });
  if (!detectedUrl) return input.project;
  const detected = { url: detectedUrl };
  try {
    // The main repository syncs by default (linked ones on demand): the switch needs its checkout,
    // which a candidate found on its remote does not have yet.
    await input.backend.projectWorkspace.syncLinkedRepository({
      workspaceRoot: input.bootstrap.workspaceRoot,
      url: detected.url,
    });
    await waitForLinkedRepositoryReady({
      backend: input.backend,
      workspaceRoot: input.bootstrap.workspaceRoot,
      url: detected.url,
    });
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
