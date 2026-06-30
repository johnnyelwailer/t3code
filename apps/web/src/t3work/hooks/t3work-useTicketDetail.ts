import { useState, useEffect, useCallback, useMemo } from "react";
import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import { useBackend } from "~/t3work/backend/t3work-index";
import {
  buildAtlassianResourceCacheKey,
  fetchAtlassianResourceSnapshot,
  readCachedAtlassianResourceSnapshot,
} from "~/t3work/t3work-atlassianResourceSnapshotCache";

export interface TicketDetail {
  snapshot: ResourceSnapshot | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useTicketDetail(project: ProjectShellProject, ticketId: string): TicketDetail {
  const backend = useBackend();
  const cacheKey = useMemo(
    () =>
      buildAtlassianResourceCacheKey({
        provider: project.source.provider,
        accountId: project.source.accountId,
        externalProjectId: project.source.externalProjectId,
        key: ticketId,
      }),
    [project.source.accountId, project.source.externalProjectId, project.source.provider, ticketId],
  );
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(() =>
    readCachedAtlassianResourceSnapshot({
      project,
      key: ticketId,
    }),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!backend) throw new Error("Backend not available");
      const cached = readCachedAtlassianResourceSnapshot({
        project,
        key: ticketId,
      });
      if (cached) {
        setSnapshot(cached);
      }
      const result = await fetchAtlassianResourceSnapshot({
        backend,
        project,
        key: ticketId,
      });
      setSnapshot(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ticket details");
    } finally {
      setLoading(false);
    }
  }, [backend, project, ticketId]);

  useEffect(() => {
    setSnapshot(
      readCachedAtlassianResourceSnapshot({
        project,
        key: ticketId,
      }),
    );
  }, [cacheKey, project, ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  return { snapshot, loading, error, reload: load };
}
