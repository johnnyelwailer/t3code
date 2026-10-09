import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { readLocalApi } from "~/localApi";
import { publishStoredProjectsSnapshot } from "./t3team-storedProjectsSnapshot";
import {
  loadStoredProjects,
  saveStoredProjects,
  upsertProjectBySource,
} from "./t3team-projectStoreUtils";

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
  return parseStoredProjects(settings?.t3teamStoredProjectsJson);
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

    const persistedJson = settings?.t3teamStoredProjectsJson ?? "";
    if (persistedJson !== mergedJson && (persistedJson.length > 0 || mergedProjects.length > 0)) {
      await localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3teamStoredProjectsJson: mergedJson,
      });
    }

    return mergedProjects;
  } catch {
    return localProjects;
  }
}

let hydration: Promise<ReadonlyArray<ProjectShellProject>> | null = null;

/**
 * `hydrateStoredProjects()`, once per page, shared by every caller.
 *
 * It is an IPC round trip plus a full client-settings parse, and it merges the server-persisted
 * list back into localStorage as a side effect. Running it per consumer paid for it twice and —
 * worse — let a consumer whose effect re-ran before the promise resolved cancel its own result and
 * keep the partial localStorage snapshot. That was the cold-start "Nothing needs you": My Work
 * scoped its digest to a project list that had not finished loading.
 */
export function ensureStoredProjectsHydrated(): Promise<ReadonlyArray<ProjectShellProject>> {
  hydration ??= hydrateStoredProjects()
    // hydrateStoredProjects already falls back to the local list; this only covers an outright throw.
    .catch(() => loadStoredProjects())
    .then((projects) => {
      publishStoredProjectsSnapshot(projects);
      return projects;
    });
  return hydration;
}

/** Test-only: a fresh page. Pair with `resetStoredProjectsSnapshotForTests`. */
export function resetStoredProjectsHydrationForTests(): void {
  hydration = null;
}

export function persistStoredProjects(projects: ReadonlyArray<ProjectShellProject>): void {
  // Every mutation path (add, delete, rename, update) lands here, so this is where the page's
  // shared list stays current — My Work must see a project the user just added.
  publishStoredProjectsSnapshot(projects);
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
        t3teamStoredProjectsJson: nextJson,
      });
    })
    .catch(() => {
      // Ignore persistence failures and keep the current renderer state.
    });
}
