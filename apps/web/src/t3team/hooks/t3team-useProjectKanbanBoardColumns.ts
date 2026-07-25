import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { AtlassianBoardColumnsResponse } from "~/t3team/backend/t3team-types";

import { readIntegrationCache, writeIntegrationCache } from "./t3team-integrationCache";
import { startBrowserPolling } from "./t3team-integrationPolling";

const ATLASSIAN_BOARD_COLUMNS_POLL_INTERVAL_MS = 5 * 60_000;
const ATLASSIAN_BOARD_COLUMNS_CACHE_MAX_AGE_MS = 5 * 60_000;
const ATLASSIAN_BOARD_COLUMNS_CACHE_KEY_VERSION = "v2";

export function useProjectKanbanBoardColumns(project: ProjectShellProject) {
  const backend = useBackend();
  const cacheKey = useMemo(
    () =>
      `atlassian:boardColumns:${ATLASSIAN_BOARD_COLUMNS_CACHE_KEY_VERSION}:${project.source.provider}:${project.source.accountId ?? "none"}:${project.source.externalProjectId ?? "none"}`,
    [project.source.accountId, project.source.externalProjectId, project.source.provider],
  );
  const [response, setResponse] = useState<AtlassianBoardColumnsResponse | null>(
    () => readIntegrationCache<AtlassianBoardColumnsResponse>(cacheKey)?.value ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project.source.externalProjectId) {
      return;
    }

    if (!project.source.accountId) {
      setResponse(null);
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      setLoading(false);
      return;
    }

    const cachedRecord = readIntegrationCache<AtlassianBoardColumnsResponse>(cacheKey);
    setLoading(cachedRecord?.value == null);
    setError(null);

    try {
      if (!backend) {
        throw new Error("Backend not available");
      }

      const nextResponse = await backend.atlassian.getBoardColumns({
        account: {
          id: project.source.accountId,
          provider: project.source.provider,
        },
        externalProjectId: project.source.externalProjectId,
      });
      const nextCheckedAt = Date.now();

      setResponse(nextResponse);
      writeIntegrationCache(cacheKey, nextResponse, { updatedAt: nextCheckedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Jira board columns");
    } finally {
      setLoading(false);
    }
  }, [
    backend,
    cacheKey,
    project.source.accountId,
    project.source.externalProjectId,
    project.source.provider,
  ]);

  useEffect(() => {
    const cachedRecord = readIntegrationCache<AtlassianBoardColumnsResponse>(cacheKey);
    setResponse(cachedRecord?.value ?? null);
  }, [cacheKey]);

  useEffect(() => {
    if (!project.source.externalProjectId) {
      return;
    }

    if (!project.source.accountId) {
      setResponse(null);
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      setLoading(false);
      return;
    }

    if (!backend) {
      return;
    }

    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: ATLASSIAN_BOARD_COLUMNS_POLL_INTERVAL_MS,
      maxAgeMs: ATLASSIAN_BOARD_COLUMNS_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => readIntegrationCache<AtlassianBoardColumnsResponse>(cacheKey)?.updatedAt,
      poll: load,
    });

    return () => {
      poller.dispose();
    };
  }, [backend, cacheKey, load, project.source.accountId, project.source.externalProjectId]);

  return {
    availableStatuses: response?.availableStatuses ?? [],
    boardColumns: response?.boardColumns ?? [],
    selectedBoardId: response?.selectedBoardId,
    loading,
    error,
    reload: load,
  };
}
