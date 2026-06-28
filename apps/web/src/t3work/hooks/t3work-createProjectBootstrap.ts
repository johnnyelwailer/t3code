import { resolveT3WorkProjectSetupProfileId } from "~/t3work/t3work-projectSetup";
import type { ProjectShellProject } from "@t3tools/project-context";
import type {
  LinkedRepositorySyncResult,
  ProjectWorkspaceBootstrapResult,
} from "~/t3work/backend/t3work-types";
import type { SidecarComposition } from "@t3tools/project-recipes";

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

export type ProjectAgentSetup = {
  readonly profileId?: string;
  readonly sidecarSections?: SidecarComposition;
};

export function normalizeRepositoryUrls(
  urls: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
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
  setupProfileId?: string,
): Record<string, unknown> {
  const base = readObjectRecord(externalProjectRaw);
  const references: ProjectAgentReferences = {
    linkedRepositories: linkedRepositoryUrls.map((url) => ({ url })),
  };
  const agentSetup: ProjectAgentSetup = {
    profileId: resolveT3WorkProjectSetupProfileId(setupProfileId),
  };
  return { ...base, agentReferences: references, agentSetup };
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

export function readLinkedRepositoryUrlsFromProject(
  project: ProjectShellProject,
): ReadonlyArray<string> {
  const currentRaw = readObjectRecord(project.source.raw);
  const currentReferences = readObjectRecord(currentRaw.agentReferences);
  const linked = Array.isArray(currentReferences.linkedRepositories)
    ? (currentReferences.linkedRepositories as ReadonlyArray<LinkedRepositoryReference>)
    : [];
  return normalizeRepositoryUrls(
    linked.map((entry) => entry?.url).filter((value): value is string => typeof value === "string"),
  );
}

export function readProjectSetupProfileIdFromProject(project: ProjectShellProject): string {
  const currentRaw = readObjectRecord(project.source.raw);
  const currentSetup = readObjectRecord(currentRaw.agentSetup);
  return resolveT3WorkProjectSetupProfileId(
    typeof currentSetup.profileId === "string" ? currentSetup.profileId : undefined,
  );
}

function isSidecarComposition(value: unknown): value is SidecarComposition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const sections = (value as SidecarComposition).sections;
  return (
    Array.isArray(sections) &&
    sections.every(
      (section) =>
        typeof section === "object" &&
        section !== null &&
        typeof section.sectionId === "string" &&
        section.sectionId.trim().length > 0,
    )
  );
}

export function readProjectSidecarCompositionFromProject(
  project: ProjectShellProject,
): SidecarComposition | undefined {
  const currentRaw = readObjectRecord(project.source.raw);
  const currentSetup = readObjectRecord(currentRaw.agentSetup);
  const sidecarSections = currentSetup.sidecarSections;
  return isSidecarComposition(sidecarSections) ? sidecarSections : undefined;
}

export function replaceLinkedRepositoryUrlsInProject(
  project: ProjectShellProject,
  linkedRepositoryUrls: ReadonlyArray<string>,
): ProjectShellProject {
  const currentRaw = readObjectRecord(project.source.raw);
  const currentReferences = readObjectRecord(currentRaw.agentReferences);
  const normalized = normalizeRepositoryUrls(linkedRepositoryUrls);
  const nextReferences: ProjectAgentReferences = {
    ...(typeof currentReferences.referencesRoot === "string"
      ? { referencesRoot: currentReferences.referencesRoot }
      : {}),
    ...(typeof currentReferences.workspaceRepositoryInitialized === "boolean"
      ? { workspaceRepositoryInitialized: currentReferences.workspaceRepositoryInitialized }
      : {}),
    linkedRepositories: normalized.map((url) => ({ url })),
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
