import { useState, useEffect, useCallback, useMemo } from "react";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";
import { asT3workPollingBackend } from "~/t3work/backend/t3work-pollingBackend";
import { useBackend } from "~/t3work/backend/t3work-index";
import { resourceRefToProjectTicket } from "~/t3work/t3work-ticketMappers";
import { readIntegrationCache, writeIntegrationCache } from "./t3work-integrationCache";
import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "./t3work-integrationPolling";

export function useProjectResources(project: ProjectShellProject) {
  const backend = asT3workPollingBackend(useBackend());
  const cacheKey = useMemo(
    () =>
      `atlassian:listResources:${project.source.provider}:${project.source.accountId ?? "none"}:${project.source.externalProjectId ?? "none"}`,
    [project.source.accountId, project.source.externalProjectId, project.source.provider],
  );
  const [resources, setResources] = useState<ResourcePage | null>(
    () => readIntegrationCache<ResourcePage>(cacheKey)?.value ?? null,
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>(
    () => readIntegrationCache<ResourcePage>(cacheKey)?.updatedAt,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project.source.externalProjectId) return;
    if (!project.source.accountId) {
      setResources(null);
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      return;
    }
    const cachedRecord = readIntegrationCache<ResourcePage>(cacheKey);
    setLoading(cachedRecord?.value == null);
    setError(null);

    try {
      if (!backend) throw new Error("Backend not available");
      const result = await backend.atlassian.pollResources({
        account: {
          id: project.source.accountId,
          provider: project.source.provider,
        },
        externalProjectId: project.source.externalProjectId,
        ...(cachedRecord?.fingerprint ? { knownFingerprint: cachedRecord.fingerprint } : {}),
      });
      const page = result.unchanged ? (cachedRecord?.value ?? null) : result.value;
      if (!page) {
        throw new Error("Missing cached Atlassian resources for unchanged poll result.");
      }
      const nextCheckedAt = Date.now();
      setResources(page);
      setLastCheckedAt(nextCheckedAt);
      writeIntegrationCache(cacheKey, page, {
        fingerprint: result.fingerprint,
        updatedAt: nextCheckedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resources");
    } finally {
      setLoading(false);
    }
  }, [
    backend,
    cacheKey,
    project.source.externalProjectId,
    project.source.accountId,
    project.source.provider,
  ]);

  useEffect(() => {
    const cachedRecord = readIntegrationCache<ResourcePage>(cacheKey);
    setResources(cachedRecord?.value ?? null);
    setLastCheckedAt(cachedRecord?.updatedAt);
  }, [cacheKey]);

  useEffect(() => {
    if (!project.source.externalProjectId) {
      return;
    }
    if (!project.source.accountId) {
      setResources(null);
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      setLoading(false);
      return;
    }
    if (!backend) {
      return;
    }

    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
      maxAgeMs: ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => readIntegrationCache<ResourcePage>(cacheKey)?.updatedAt,
      poll: load,
    });

    return () => {
      poller.dispose();
    };
  }, [backend, cacheKey, load, project.source.accountId, project.source.externalProjectId]);

  const tickets = useMemo(() => {
    if (!resources) return [];
    return resources.items.map((ref) => resourceRefToProjectTicket(project.id, ref));
  }, [resources, project.id]);

  return { resources, tickets, loading, error, reload: load, lastCheckedAt };
}
