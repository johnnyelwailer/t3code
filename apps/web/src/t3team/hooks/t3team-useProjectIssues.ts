import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import { asT3TeamProjectIssuesBackend } from "~/t3team/backend/t3team-projectIssuesBackend";
import { resourceRefToProjectTicket } from "~/t3team/t3team-ticketMappers";

import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "./t3team-integrationPolling";

/**
 * Every ticket in a project, served by the server's whole-project mirror.
 *
 * Deliberately holds **no** browser cache: the payload comes from the server's
 * SQLite mirror, so a re-read is cheap and there is nothing worth mirroring
 * into `localStorage` (doc 33 — `localStorage` is settings/UI-state only).
 * Freshness therefore lives entirely in memory: the poll cadence matches the
 * other integration pollers, and the mirror's own background sync is what
 * actually keeps the data current.
 *
 * Use this — not `useProjectResources` (My Work: `assignee = currentUser()`) —
 * anywhere a view has to resolve relationships between issues.
 */
export function useProjectIssues(project: ProjectShellProject) {
  const backend = asT3TeamProjectIssuesBackend(useBackend());
  const accountId = project.source.accountId;
  const externalProjectId = project.source.externalProjectId;
  const provider = project.source.provider;

  const [page, setPage] = useState<ResourcePage | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  const lastPayloadRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!externalProjectId) return;
    if (!accountId) {
      setPage(null);
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      return;
    }
    if (!backend) return;

    setLoading(lastPayloadRef.current === null);
    setError(null);
    try {
      const next = await backend.atlassian.listProjectIssues({
        account: { id: accountId, provider },
        externalProjectId,
      });
      // Keep the previous object identity when the mirror hasn't changed —
      // every consumer downstream keys effects off this array.
      const serialized = JSON.stringify(next);
      if (serialized !== lastPayloadRef.current) {
        lastPayloadRef.current = serialized;
        setPage(next);
      }
      const checkedAt = Date.now();
      lastCheckedAtRef.current = checkedAt;
      setLastCheckedAt(checkedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project issues");
    } finally {
      setLoading(false);
    }
  }, [accountId, backend, externalProjectId, provider]);

  useEffect(() => {
    lastPayloadRef.current = null;
    lastCheckedAtRef.current = undefined;
    setPage(null);
    setLastCheckedAt(undefined);
  }, [accountId, externalProjectId, provider]);

  useEffect(() => {
    if (!backend || !externalProjectId || !accountId) return;
    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
      maxAgeMs: ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => lastCheckedAtRef.current,
      poll: load,
    });
    return () => poller.dispose();
  }, [accountId, backend, externalProjectId, load]);

  const tickets = useMemo(
    () => (page ? page.items.map((ref) => resourceRefToProjectTicket(project.id, ref)) : []),
    [page, project.id],
  );

  return { tickets, loading, error, reload: load, lastCheckedAt };
}
