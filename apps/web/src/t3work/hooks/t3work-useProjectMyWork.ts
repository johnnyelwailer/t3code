import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";
import { asT3workPollingBackend } from "~/t3work/backend/t3work-pollingBackend";
import { useBackend } from "~/t3work/backend/t3work-index";
import { resourceRefToProjectTicket } from "~/t3work/t3work-ticketMappers";
import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "./t3work-integrationPolling";

/**
 * My Work data source. Unlike `useProjectResources` (backlog/board/etc.),
 * this hook keeps no localStorage cache: the last page + fingerprint live
 * only in React state/refs for the lifetime of the mounted view. The server
 * (SQLite mirror) is the durable cache now — see docs/t3work-mvp Epic 33.
 */
export function useProjectMyWork(project: ProjectShellProject) {
  const backend = asT3workPollingBackend(useBackend());
  const [resources, setResources] = useState<ResourcePage | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fingerprintRef = useRef<string | undefined>(undefined);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  // Bumped whenever the target project/account changes (and on unmount) so an
  // in-flight load() from a stale project/account cannot clobber state that
  // belongs to whatever is current by the time its await resolves.
  const generationRef = useRef(0);

  const accountId = project.source.accountId;
  const externalProjectId = project.source.externalProjectId;
  const provider = project.source.provider;

  const load = useCallback(async () => {
    const generation = generationRef.current;
    if (!externalProjectId) return;
    if (!accountId) {
      if (generationRef.current !== generation) return;
      setResources(null);
      fingerprintRef.current = undefined;
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      return;
    }
    setLoading(fingerprintRef.current === undefined);
    setError(null);

    try {
      if (!backend) throw new Error("Backend not available");
      const result = await backend.atlassian.pollMyWork({
        account: {
          id: accountId,
          provider,
        },
        externalProjectId,
        ...(fingerprintRef.current ? { knownFingerprint: fingerprintRef.current } : {}),
      });

      if (generationRef.current !== generation) return;

      if (result.unchanged) {
        fingerprintRef.current = result.fingerprint;
        if (lastCheckedAtRef.current === undefined) {
          const nextCheckedAt = Date.now();
          lastCheckedAtRef.current = nextCheckedAt;
          setLastCheckedAt(nextCheckedAt);
        }
        return;
      }

      const nextCheckedAt = Date.now();
      fingerprintRef.current = result.fingerprint;
      lastCheckedAtRef.current = nextCheckedAt;
      setResources(result.value);
      setLastCheckedAt(nextCheckedAt);
    } catch (e) {
      if (generationRef.current !== generation) return;
      setError(e instanceof Error ? e.message : "Failed to load resources");
    } finally {
      if (generationRef.current === generation) {
        setLoading(false);
      }
    }
  }, [backend, accountId, externalProjectId, provider]);

  // Reset in-memory state when switching projects.
  useEffect(() => {
    generationRef.current += 1;
    setResources(null);
    setLastCheckedAt(undefined);
    fingerprintRef.current = undefined;
    lastCheckedAtRef.current = undefined;

    return () => {
      generationRef.current += 1;
    };
  }, [accountId, externalProjectId, provider]);

  useEffect(() => {
    if (!externalProjectId) {
      return;
    }
    if (!accountId) {
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
      getUpdatedAt: () => lastCheckedAtRef.current,
      poll: load,
    });

    return () => {
      poller.dispose();
    };
  }, [backend, load, accountId, externalProjectId]);

  const tickets = useMemo(() => {
    if (!resources) return [];
    return resources.items.map((ref) => resourceRefToProjectTicket(project.id, ref));
  }, [resources, project.id]);

  return { resources, tickets, loading, error, reload: load, lastCheckedAt };
}
