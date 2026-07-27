import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import {
  asT3TeamProjectIssuesBackend,
  type T3TeamProjectIssuesResult,
} from "~/t3team/backend/t3team-projectIssuesBackend";
import { resourceRefToProjectTicket } from "~/t3team/t3team-ticketMappers";

import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "./t3team-integrationPolling";

/** While the server's mirror is still filling, re-ask on this cadence instead of the poll interval. */
const COLD_MIRROR_RETRY_MS = 2_000;
const COLD_MIRROR_MAX_ATTEMPTS = 20;

type ProjectIssuesState = {
  readonly page: ResourcePage | null;
  readonly source: T3TeamProjectIssuesResult["source"] | null;
  readonly capabilities: T3TeamProjectIssuesResult["capabilities"];
  readonly attempt: number;
};

const EMPTY_STATE: ProjectIssuesState = {
  page: null,
  source: null,
  capabilities: undefined,
  attempt: 0,
};

/**
 * Every ticket in a project, served by the server's whole-project mirror.
 *
 * Deliberately holds **no** browser cache: the payload comes from the server's
 * SQLite mirror, so a re-read is cheap and there is nothing worth mirroring
 * into `localStorage` (doc 33 — `localStorage` is settings/UI-state only).
 *
 * Use this — not `useProjectResources` (My Work: `assignee = currentUser()`) —
 * anywhere a view has to resolve relationships between issues.
 */
export function useProjectIssues(project: ProjectShellProject) {
  const backend = asT3TeamProjectIssuesBackend(useBackend());
  const accountId = project.source.accountId;
  const externalProjectId = project.source.externalProjectId;
  const provider = project.source.provider;

  const [state, setState] = useState<ProjectIssuesState>(EMPTY_STATE);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  const lastPayloadRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback((): Promise<void> => {
    // Single-flight: the unconditional first fetch, the poller and the header's
    // Refresh button all call this, and they overlap on mount.
    if (inFlightRef.current) return inFlightRef.current;

    const run = async () => {
      if (!externalProjectId || !backend) return;
      if (!accountId) {
        setState(EMPTY_STATE);
        setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
        return;
      }
      setLoading(lastPayloadRef.current === null);
      setError(null);
      try {
        const result = await backend.atlassian.listProjectIssues({
          account: { id: accountId, provider },
          externalProjectId,
        });
        // Keep the previous object identity when the mirror hasn't changed —
        // every consumer downstream keys effects off the derived array.
        const serialized = JSON.stringify(result.page);
        const changed = serialized !== lastPayloadRef.current;
        if (changed) lastPayloadRef.current = serialized;
        setState((current) => ({
          page: changed ? result.page : current.page,
          source: result.source,
          // Sticky: a later response that hasn't resolved capabilities must not
          // downgrade a label the view is already rendering with.
          capabilities: result.capabilities ?? current.capabilities,
          attempt: current.attempt + 1,
        }));
        const checkedAt = Date.now();
        lastCheckedAtRef.current = checkedAt;
        setLastCheckedAt(checkedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load project issues");
      } finally {
        setLoading(false);
      }
    };

    const promise = run().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, [accountId, backend, externalProjectId, provider]);

  useEffect(() => {
    lastPayloadRef.current = null;
    lastCheckedAtRef.current = undefined;
    setState(EMPTY_STATE);
    setLastCheckedAt(undefined);
  }, [accountId, externalProjectId, provider]);

  /**
   * First fetch, deliberately NOT routed through the poller. `startBrowserPolling` refuses to
   * schedule while the tab is hidden — right for a refresh cadence, fatal for first paint here:
   * with no browser-side cache to fall back on, a detail view opened in a background tab rendered
   * an empty project indefinitely, so every relationship (children, parent, links) resolved to
   * nothing.
   */
  useEffect(() => {
    void load();
  }, [load]);

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

  /**
   * A `live-fallback` response is the viewer's own issues standing in while the mirror backfills.
   * Sitting on that subset for a whole 90 s poll interval would show a work item with most of its
   * children missing, so chase the mirror on a short cadence until it answers.
   */
  useEffect(() => {
    if (state.source !== "live-fallback" || state.attempt >= COLD_MIRROR_MAX_ATTEMPTS) return;
    const timeoutId = setTimeout(() => void load(), COLD_MIRROR_RETRY_MS);
    return () => clearTimeout(timeoutId);
  }, [load, state.attempt, state.source]);

  const tickets = useMemo(
    () =>
      state.page ? state.page.items.map((ref) => resourceRefToProjectTicket(project.id, ref)) : [],
    [state.page, project.id],
  );

  return {
    tickets,
    capabilities: state.capabilities,
    estimateFieldLabel: state.capabilities?.estimateFieldLabel,
    loading,
    error,
    reload: load,
    lastCheckedAt,
  };
}
