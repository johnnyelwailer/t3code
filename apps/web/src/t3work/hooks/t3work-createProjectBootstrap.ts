import type { ProjectShellProject } from "@t3tools/project-context";
import type { LinkedRepositorySyncResult, ProjectWorkspaceBootstrapResult } from "~/t3work/backend/t3work-types";

export type LinkedRepositoryReference = {
  readonly url: string;
  readonly localPath?: string;
  readonly status?: "cloned" | "updated" | "failed";
  readonly error?: string;
};

export type ProjectAgentReferences = {
  readonly referencesRoot?: string;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositoryReference>;
  readonly workspaceRepositoryInitialized?: boolean;
};

export function normalizeRepositoryUrls(urls: ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  const deduped = new Set<string>();
  for (const value of urls ?? []) {
    const trimmed = value.trim();
    if (trimmed.length > 0) deduped.add(trimmed);
  }
  return [...deduped.values()];
}

function readObjectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildInitialRaw(
  externalProjectRaw: unknown,
  linkedRepositoryUrls: ReadonlyArray<string>,
): Record<string, unknown> {
  const base = readObjectRecord(externalProjectRaw);
  const references: ProjectAgentReferences = { linkedRepositories: linkedRepositoryUrls.map((url) => ({ url })) };
  return { ...base, agentReferences: references };
}

function mapLinkedRepositories(
  items: ReadonlyArray<LinkedRepositorySyncResult>,
): ReadonlyArray<LinkedRepositoryReference> {
  return items.map((item) => ({
    url: item.url,
    localPath: item.localPath,
    status: item.status,
    ...(item.error ? { error: item.error } : {}),
  }));
}

export function applyWorkspaceBootstrapToProject(
  project: ProjectShellProject,
  bootstrap: ProjectWorkspaceBootstrapResult,
): ProjectShellProject {
  const currentRaw = readObjectRecord(project.source.raw);
  const currentReferences = readObjectRecord(currentRaw.agentReferences);
  const existingLinked = Array.isArray(currentReferences.linkedRepositories)
    ? (currentReferences.linkedRepositories as ReadonlyArray<LinkedRepositoryReference>)
    : [];

  const nextReferences: ProjectAgentReferences = {
    referencesRoot: bootstrap.referencesRoot,
    workspaceRepositoryInitialized: bootstrap.workspaceRepositoryInitialized,
    linkedRepositories:
      bootstrap.linkedRepositories.length > 0
        ? mapLinkedRepositories(bootstrap.linkedRepositories)
        : existingLinked,
  };

  return {
    ...project,
    source: {
      ...project.source,
      raw: {
        ...currentRaw,
        agentReferences: nextReferences,
      },
    },
  };
}