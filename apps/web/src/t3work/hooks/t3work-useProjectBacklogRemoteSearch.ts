import { useEffect, useRef, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3work/backend/t3work-index";
import type { AtlassianBacklogSearchResult } from "~/t3work/backend/t3work-atlassianBackendTypes";
import { resourceRefToProjectTicket } from "~/t3work/t3work-ticketMappers";
import type { ProjectTicket } from "~/t3work/t3work-types";

import type { BacklogSelectionInput } from "./t3work-projectBacklogCache";

export const PROJECT_BACKLOG_SEARCH_MIN_QUERY_LENGTH = 2;
export const PROJECT_BACKLOG_LIVE_SEARCH_DEBOUNCE_MS = 400;

/**
 * Parallel search path for the backlog query box: the offline SQLite cache is
 * searched immediately (results stream in right away), while a debounced live
 * provider search runs for the same selection so items that were never synced
 * also appear. Live hits are persisted server-side, so they stay available
 * offline afterwards.
 */
export function useProjectBacklogRemoteSearch(input: {
  readonly project: ProjectShellProject;
  readonly selection: BacklogSelectionInput;
  readonly query: string;
}) {
  const backend = useBackend();
  const [searchTickets, setSearchTickets] = useState<ReadonlyArray<ProjectTicket>>([]);
  const requestIdRef = useRef(0);

  const projectId = input.project.id;
  const { provider, accountId, externalProjectId } = input.project.source;
  const { boardId, sprintId, filterId } = input.selection;
  const trimmedQuery = input.query.trim();

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const searchBacklog = backend?.atlassian.searchBacklog;
    if (
      !searchBacklog ||
      !accountId ||
      !externalProjectId ||
      trimmedQuery.length < PROJECT_BACKLOG_SEARCH_MIN_QUERY_LENGTH
    ) {
      setSearchTickets([]);
      return;
    }

    const ticketsById = new Map<string, ProjectTicket>();
    const applyResults = (result: AtlassianBacklogSearchResult) => {
      if (requestIdRef.current !== requestId) {
        return;
      }
      for (const item of result.items) {
        ticketsById.set(item.id, resourceRefToProjectTicket(projectId, item));
      }
      setSearchTickets([...ticketsById.values()]);
    };

    const buildRequest = (mode: "offline" | "live") => ({
      account: { id: accountId, provider },
      externalProjectId,
      query: trimmedQuery,
      mode,
      ...(boardId ? { boardId } : {}),
      ...(sprintId ? { sprintId } : {}),
      ...(filterId ? { filterId } : {}),
    });

    // Offline path: cheap local-SQL search, fire immediately.
    void searchBacklog(buildRequest("offline"))
      .then(applyResults)
      .catch(() => undefined);

    // Live path: debounced provider search for the same filters.
    const liveTimer = setTimeout(() => {
      void searchBacklog(buildRequest("live"))
        .then(applyResults)
        .catch(() => undefined);
    }, PROJECT_BACKLOG_LIVE_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(liveTimer);
    };
  }, [
    backend,
    projectId,
    provider,
    accountId,
    externalProjectId,
    boardId,
    sprintId,
    filterId,
    trimmedQuery,
  ]);

  return { searchTickets };
}
