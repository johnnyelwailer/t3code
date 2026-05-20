import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { readLocalApi } from "~/localApi";
import {
  loadStoredProjects,
  saveStoredProjects,
  upsertProjectBySource,
} from "./t3work-projectStoreUtils";

function encodeStoredProjects(projects: ReadonlyArray<ProjectShellProject>): string {
  return JSON.stringify(projects);
}

function parseStoredProjects(raw: string | undefined): ProjectShellProject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProjectShellProject[]) : [];
  } catch {
    return [];
  }
}

export function mergeStoredProjects(
  ...collections: ReadonlyArray<ReadonlyArray<ProjectShellProject>>
): ProjectShellProject[] {
  let next: ProjectShellProject[] = [];
  for (const collection of collections) {
    for (const project of collection) {
      next = upsertProjectBySource(next, project);
    }
  }
  return next;
}

export function readStoredProjectsFromClientSettings(
  settings: ClientSettings | null | undefined,
): ProjectShellProject[] {
  return parseStoredProjects(settings?.t3workStoredProjectsJson);
}

export async function hydrateStoredProjects(): Promise<ProjectShellProject[]> {
  const localProjects = loadStoredProjects();
  const localApi = readLocalApi();
  if (!localApi) {
    return localProjects;
  }

  try {
    const settings = await localApi.persistence.getClientSettings();
    const currentSettings = settings ?? DEFAULT_CLIENT_SETTINGS;
    const persistedProjects = readStoredProjectsFromClientSettings(settings);
    const mergedProjects = mergeStoredProjects(persistedProjects, localProjects);
    const mergedJson = encodeStoredProjects(mergedProjects);

    if (encodeStoredProjects(localProjects) !== mergedJson) {
      saveStoredProjects(mergedProjects);
    }

    const persistedJson = settings?.t3workStoredProjectsJson ?? "";
    if (persistedJson !== mergedJson && (persistedJson.length > 0 || mergedProjects.length > 0)) {
      await localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3workStoredProjectsJson: mergedJson,
      });
    }

    return mergedProjects;
  } catch {
    return localProjects;
  }
}

export function persistStoredProjects(projects: ReadonlyArray<ProjectShellProject>): void {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const nextJson = encodeStoredProjects(projects);
  void localApi.persistence
    .getClientSettings()
    .then((settings) => {
      const currentSettings = settings ?? DEFAULT_CLIENT_SETTINGS;
      localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3workStoredProjectsJson: nextJson,
      });
    })
    .catch(() => {
      // Ignore persistence failures and keep the current renderer state.
    });
}
