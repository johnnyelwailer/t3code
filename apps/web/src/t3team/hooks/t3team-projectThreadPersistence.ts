import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts";

import { readLocalApi } from "~/localApi";
import {
  createDefaultProjectDashboardModeState,
  getProjectDashboardModeStorageKey,
} from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectThread } from "~/t3team/t3team-types";

const LEGACY_STORAGE_KEY = "t3team:threads";
const defaultDashboardMode = createDefaultProjectDashboardModeState().dashboardMode;

function dedupeStoredThreads(threads: ReadonlyArray<ProjectThread>): ProjectThread[] {
  const byId = new Map<string, ProjectThread>();
  for (const thread of threads) {
    byId.set(thread.id, thread);
  }
  return [...byId.values()];
}

function isLegacyDashboardThread(thread: ProjectThread): boolean {
  return (
    !thread.ticketId &&
    !thread.dashboardMode &&
    (thread.kickoffPending === true ||
      Boolean(thread.kickoffMessage) ||
      thread.title === "Project kickoff")
  );
}

function resolvePersistedDashboardMode(projectId: string) {
  try {
    const raw = localStorage.getItem(getProjectDashboardModeStorageKey(projectId));
    if (!raw) {
      return defaultDashboardMode;
    }

    const parsed = JSON.parse(raw) as { dashboardMode?: unknown };
    return parsed.dashboardMode === "backlog" || parsed.dashboardMode === "my-work"
      ? parsed.dashboardMode
      : defaultDashboardMode;
  } catch {
    return defaultDashboardMode;
  }
}

function migrateStoredThreads(threads: ReadonlyArray<ProjectThread>): {
  threads: ProjectThread[];
  changed: boolean;
} {
  let changed = false;
  const migrated = threads.map((thread) => {
    if (!isLegacyDashboardThread(thread)) {
      return thread;
    }

    changed = true;
    return {
      ...thread,
      dashboardMode: resolvePersistedDashboardMode(thread.projectId),
    };
  });

  return { threads: migrated, changed };
}

function encodeStoredThreads(threads: ReadonlyArray<ProjectThread>): string {
  return JSON.stringify(dedupeStoredThreads(threads));
}

function parseStoredThreads(raw: string | undefined): ProjectThread[] {
  try {
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const dedupedThreads = dedupeStoredThreads(parsed as ProjectThread[]);
    const { threads } = migrateStoredThreads(dedupedThreads);

    return threads;
  } catch {
    return [];
  }
}

export function mergeStoredThreads(
  ...collections: ReadonlyArray<ReadonlyArray<ProjectThread>>
): ProjectThread[] {
  return dedupeStoredThreads(collections.flatMap((collection) => collection));
}

export function readStoredThreadsFromClientSettings(
  settings: ClientSettings | null | undefined,
): ProjectThread[] {
  return parseStoredThreads(settings?.t3teamStoredThreadsJson);
}

function readLegacyStoredThreads(): ProjectThread[] {
  return parseStoredThreads(localStorage.getItem(LEGACY_STORAGE_KEY) ?? undefined);
}

function clearLegacyStoredThreads(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore cleanup failures and keep the migrated backend state.
  }
}

function rewriteLegacyStoredThreads(threads: ReadonlyArray<ProjectThread>): void {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, encodeStoredThreads(threads));
  } catch {
    // Ignore migration rewrite failures and keep the current renderer state.
  }
}

export async function hydrateStoredThreads(): Promise<ProjectThread[]> {
  const legacyThreads = readLegacyStoredThreads();
  const localApi = readLocalApi();
  if (!localApi) {
    return legacyThreads;
  }

  try {
    const settings = await localApi.persistence.getClientSettings();
    const currentSettings = settings ?? DEFAULT_CLIENT_SETTINGS;
    const persistedThreads = readStoredThreadsFromClientSettings(settings);
    const mergedThreads = mergeStoredThreads(persistedThreads, legacyThreads);
    const mergedJson = encodeStoredThreads(mergedThreads);
    const persistedJson = settings?.t3teamStoredThreadsJson ?? "";

    if (persistedJson !== mergedJson && (persistedJson.length > 0 || mergedThreads.length > 0)) {
      await localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3teamStoredThreadsJson: mergedJson,
      });
    }

    if (legacyThreads.length > 0) {
      clearLegacyStoredThreads();
    }

    return mergedThreads;
  } catch {
    if (legacyThreads.length > 0) {
      rewriteLegacyStoredThreads(legacyThreads);
    }
    return legacyThreads;
  }
}

export function persistStoredThreads(threads: ReadonlyArray<ProjectThread>): void {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const nextJson = encodeStoredThreads(threads);
  void localApi.persistence
    .getClientSettings()
    .then((settings) => {
      const currentSettings = settings ?? DEFAULT_CLIENT_SETTINGS;
      return localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3teamStoredThreadsJson: nextJson,
      });
    })
    .catch(() => {
      // Ignore persistence failures and keep the current renderer state.
    });
}
