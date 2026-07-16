import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  readIntegrationCache,
  writeIntegrationCache,
} from "~/t3work/hooks/t3work-integrationCache";

type SnapshotCacheKeyInput = {
  provider: string;
  accountId?: string | null | undefined;
  externalProjectId?: string | null | undefined;
  key: string;
};

type SnapshotLoaderInput = {
  backend: BackendApi;
  project: ProjectShellProject;
  key: string;
};

export function buildAtlassianResourceCacheKey(input: SnapshotCacheKeyInput): string {
  return `atlassian:getResource:${input.provider}:${input.accountId ?? "none"}:${input.externalProjectId ?? "none"}:${input.key}`;
}

export function readCachedAtlassianResourceSnapshot(input: {
  project: ProjectShellProject;
  key: string;
}): ResourceSnapshot | null {
  return (
    readIntegrationCache<ResourceSnapshot>(
      buildAtlassianResourceCacheKey({
        provider: input.project.source.provider,
        accountId: input.project.source.accountId,
        externalProjectId: input.project.source.externalProjectId,
        key: input.key,
      }),
      { persist: false },
    )?.value ?? null
  );
}

export function writeCachedAtlassianResourceSnapshot(input: {
  project: ProjectShellProject;
  key: string;
  snapshot: ResourceSnapshot;
}): void {
  writeIntegrationCache(
    buildAtlassianResourceCacheKey({
      provider: input.project.source.provider,
      accountId: input.project.source.accountId,
      externalProjectId: input.project.source.externalProjectId,
      key: input.key,
    }),
    input.snapshot,
    { persist: false },
  );
}

async function fetchAndCacheAtlassianResourceSnapshot(
  input: SnapshotLoaderInput,
): Promise<ResourceSnapshot> {
  const accountId = input.project.source.accountId;
  const externalProjectId = input.project.source.externalProjectId;

  if (!accountId || !externalProjectId) {
    throw new Error(
      "Missing Atlassian account or project binding for this project. Reconnect and re-add the project.",
    );
  }

  const snapshot = await input.backend.atlassian.getResource({
    accountId,
    ref: {
      id: input.key,
      provider: input.project.source.provider,
      kind: "issue",
      projectId: externalProjectId,
    },
  });

  writeCachedAtlassianResourceSnapshot({
    project: input.project,
    key: input.key,
    snapshot,
  });

  return snapshot;
}

export async function fetchAtlassianResourceSnapshot(
  input: SnapshotLoaderInput,
): Promise<ResourceSnapshot> {
  return fetchAndCacheAtlassianResourceSnapshot(input);
}

export async function loadAtlassianResourceSnapshot(
  input: SnapshotLoaderInput & {
    refreshOnCacheHit?: boolean;
  },
): Promise<ResourceSnapshot> {
  const cachedSnapshot = readCachedAtlassianResourceSnapshot({
    project: input.project,
    key: input.key,
  });

  if (cachedSnapshot) {
    if (input.refreshOnCacheHit) {
      void fetchAndCacheAtlassianResourceSnapshot(input).catch(() => {
        // Keep cached value on background refresh failures.
      });
    }
    return cachedSnapshot;
  }

  return fetchAndCacheAtlassianResourceSnapshot(input);
}
