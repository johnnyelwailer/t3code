import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3work/t3work-types";
import { mergeProjectThreadLocalState } from "~/t3work/t3work-threadToolContext";
import { readHandoffThreadAttachmentMetadata } from "~/t3work/hooks/t3work-threadHandoffMetadata";

function readHomeDirectory(): string | null {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const home = maybeProcess.process?.env?.HOME ?? maybeProcess.process?.env?.USERPROFILE;
  if (typeof home !== "string") {
    return null;
  }

  const trimmed = home.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.replaceAll("\\", "/").replace(/\/+$/, "");
}

export function normalizeWorkspaceRootPath(
  workspaceRoot: string | null | undefined,
): string | null {
  if (typeof workspaceRoot !== "string") {
    return null;
  }

  const trimmed = workspaceRoot.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalizedSeparators = trimmed.replaceAll("\\", "/");
  const homeDirectory = readHomeDirectory();
  const expandedHomePath =
    homeDirectory && (normalizedSeparators === "~" || normalizedSeparators.startsWith("~/"))
      ? `${homeDirectory}${normalizedSeparators.slice(1)}`
      : normalizedSeparators;
  const normalizedDrive = expandedHomePath.replace(
    /^([a-z]):(?=\/|$)/,
    (_, drive: string) => `${drive.toUpperCase()}:`,
  );

  if (normalizedDrive === "/" || /^[A-Z]:\/$/.test(normalizedDrive)) {
    return normalizedDrive;
  }

  const withoutTrailingSlash = normalizedDrive.replace(/\/+$/, "");
  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : normalizedDrive;
}

function readProjectSourceRaw(
  project: ProjectShellProject | null | undefined,
): Record<string, unknown> | null {
  const raw = project?.source.raw;
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function readOwnedWorkspaceRoots(
  project: ProjectShellProject | null | undefined,
): ReadonlyArray<string> {
  const ownedRoots = new Set<string>();

  const workspaceRoot = normalizeWorkspaceRootPath(project?.workspace?.rootPath);
  if (workspaceRoot) {
    ownedRoots.add(workspaceRoot);
  }

  const raw = readProjectSourceRaw(project);
  const agentReferences = raw?.agentReferences;
  if (
    typeof agentReferences !== "object" ||
    agentReferences === null ||
    Array.isArray(agentReferences)
  ) {
    return [...ownedRoots];
  }

  const linkedRepositories = (agentReferences as Record<string, unknown>).linkedRepositories;
  if (!Array.isArray(linkedRepositories)) {
    return [...ownedRoots];
  }

  for (const entry of linkedRepositories) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const localPath = (entry as Record<string, unknown>).localPath;
    const normalizedLocalPath = normalizeWorkspaceRootPath(localPath as string | undefined);
    if (normalizedLocalPath) {
      ownedRoots.add(normalizedLocalPath);
    }
  }

  return [...ownedRoots];
}

function findLiveProjectForOwnedRoots(
  ownedWorkspaceRoots: ReadonlyArray<string>,
  liveProjects: ReadonlyArray<Project>,
): Project | undefined {
  if (ownedWorkspaceRoots.length === 0) {
    return undefined;
  }

  return liveProjects.find((candidate) => {
    const normalizedCandidateCwd = normalizeWorkspaceRootPath(candidate.cwd);
    return normalizedCandidateCwd !== null && ownedWorkspaceRoots.includes(normalizedCandidateCwd);
  });
}

export function resolveCanonicalProjectIdForWorkspaceRoot(
  workspaceRoot: string | undefined,
  fallbackProjectId: string,
  liveProjects: ReadonlyArray<Project>,
): string {
  const normalizedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!normalizedWorkspaceRoot) {
    return fallbackProjectId;
  }

  return (
    liveProjects.find(
      (candidate) => normalizeWorkspaceRootPath(candidate.cwd) === normalizedWorkspaceRoot,
    )?.id ?? fallbackProjectId
  );
}

export function resolveStoredProjectId(
  projectId: string,
  storedProjects: ReadonlyArray<ProjectShellProject>,
  liveProjects: ReadonlyArray<Project>,
): string {
  if (storedProjects.some((project) => project.id === projectId)) {
    return projectId;
  }

  const liveProject = liveProjects.find((candidate) => candidate.id === projectId);
  if (!liveProject) {
    return projectId;
  }

  const normalizedLiveWorkspaceRoot = normalizeWorkspaceRootPath(liveProject.cwd);
  if (!normalizedLiveWorkspaceRoot) {
    return projectId;
  }

  return (
    storedProjects.find((project) =>
      readOwnedWorkspaceRoots(project).includes(normalizedLiveWorkspaceRoot),
    )?.id ?? projectId
  );
}

export function remapProjectThreadToStoredProject(
  thread: ProjectThread,
  storedProjects: ReadonlyArray<ProjectShellProject>,
  liveProjects: ReadonlyArray<Project>,
): ProjectThread {
  const resolvedProjectId = resolveStoredProjectId(thread.projectId, storedProjects, liveProjects);
  return resolvedProjectId === thread.projectId
    ? thread
    : { ...thread, projectId: resolvedProjectId };
}

export function resolveCanonicalProjectId(
  project: ProjectShellProject | null | undefined,
  liveProjects: ReadonlyArray<Project>,
): string | null {
  const ownedWorkspaceRoots = readOwnedWorkspaceRoots(project);
  const liveProject = findLiveProjectForOwnedRoots(ownedWorkspaceRoots, liveProjects);
  if (!liveProject) {
    return null;
  }

  return liveProject.id;
}

export function mapLiveThreadToProjectThread(
  thread: Thread,
  projectIdOverride: string = thread.projectId,
): ProjectThread {
  const attachmentMetadata = readHandoffThreadAttachmentMetadata(thread);

  return {
    id: thread.id,
    projectId: projectIdOverride,
    ...attachmentMetadata,
    title: thread.title,
    messageCount: thread.messages.length,
    lastMessageAt: thread.latestTurn?.completedAt ?? thread.updatedAt ?? thread.createdAt,
    createdAt: thread.createdAt,
    status: thread.error
      ? "error"
      : thread.session?.status === "running" || thread.session?.status === "connecting"
        ? "running"
        : thread.session?.status === "error"
          ? "error"
          : thread.session?.status === "closed" || thread.archivedAt
            ? "completed"
            : "idle",
  };
}

export function mergeProjectThreads(threads: ReadonlyArray<ProjectThread>): ProjectThread[] {
  const byId = new Map<string, ProjectThread>();

  for (const thread of threads) {
    byId.set(thread.id, mergeProjectThreadLocalState(byId.get(thread.id), thread));
  }

  return [...byId.values()];
}
