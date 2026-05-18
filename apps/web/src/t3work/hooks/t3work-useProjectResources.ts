import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  ExternalResourceRef,
  ProjectShellProject,
  ResourcePage,
} from "@t3tools/project-context";
import type { ProjectTicket } from "~/t3work/t3work-types";
import { useBackend } from "~/t3work/backend/t3work-index";
import { resourceRefToProjectTicket } from "~/t3work/t3work-ticketMappers";

export function useProjectResources(project: ProjectShellProject) {
  const backend = useBackend();
  const [resources, setResources] = useState<ResourcePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project.source.externalProjectId) return;
    if (!project.source.accountId) {
      setResources(null);
      setError("Missing Atlassian account for this project. Reconnect and re-add the project.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (!backend) throw new Error("Backend not available");
      const page = await backend.atlassian.listResources({
        account: {
          id: project.source.accountId,
          provider: project.source.provider,
        },
        externalProjectId: project.source.externalProjectId,
      });
      setResources(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resources");
    } finally {
      setLoading(false);
    }
  }, [
    backend,
    project.source.externalProjectId,
    project.source.accountId,
    project.source.provider,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const tickets = useMemo(() => {
    if (!resources) return [];
    return resources.items.map((ref) => resourceRefToProjectTicket(project.id, ref));
  }, [resources, project.id]);

  return { resources, tickets, loading, error, reload: load };
}
