import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { AtlassianBacklogResponse, BackendApi } from "~/t3work/backend/t3work-types";

import {
  ATLASSIAN_BACKLOG_CACHE_MAX_AGE_MS,
  ATLASSIAN_BACKLOG_POLL_INTERVAL_MS,
  fingerprintProjectBacklog,
  type BacklogSelectionInput,
} from "./t3work-projectBacklogCache";
import { startBrowserPolling } from "./t3work-integrationPolling";
import {
  buildProjectBacklogRequestKey,
  shouldSkipProjectBacklogSelectionSyncReload,
  type BacklogLoadOptions,
} from "./t3work-projectBacklogPolling";
import { createProjectBacklogState, type ProjectBacklogState } from "./t3work-projectBacklogState";
import type { ConnectedBacklogSource } from "./t3work-projectBacklogMutations";
import { runProjectBacklogLoad } from "./t3work-projectBacklogLoadRunner";

export function useProjectBacklogLoader(input: {
  readonly backend: BackendApi | null;
  readonly connectedSource: ConnectedBacklogSource | null;
  readonly projectId: string;
  readonly requestedSelection: BacklogSelectionInput;
  readonly currentSelection: BacklogSelectionInput;
  readonly setBacklogState: Dispatch<SetStateAction<ProjectBacklogState>>;
  readonly onSelectionChange?: (selection: BacklogSelectionInput) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingUpdatedAt, setPollingUpdatedAt] = useState<number | null>(null);
  const refs = {
    loadRequestIdRef: useRef(0),
    visibleLoadRequestIdRef: useRef(0),
    lastLoadedAtRef: useRef<number | undefined>(undefined),
    lastFingerprintRef: useRef<string | null>(null),
    inFlightRequestRef: useRef<{ key: string; promise: Promise<void> } | null>(null),
    autoRefreshCooldownUntilRef: useRef(0),
    autoRefreshBackoffMsRef: useRef(0),
    lastAutoRefreshKeyRef: useRef<string | null>(null),
    syncedSelectionRequestKeyRef: useRef<string | null>(null),
  };

  const applyBacklogResponse = useEffectEvent((response: AtlassianBacklogResponse) => {
    const updatedAt = response.cache?.updatedAt ?? Date.now();
    refs.lastLoadedAtRef.current = updatedAt;
    setPollingUpdatedAt(updatedAt);
    refs.lastFingerprintRef.current = fingerprintProjectBacklog(response);
    input.setBacklogState(createProjectBacklogState(input.projectId, response));

    const nextSelection = {
      ...(response.selectedBoardId ? { boardId: response.selectedBoardId } : {}),
      ...(response.selectedSprintId ? { sprintId: response.selectedSprintId } : {}),
      ...(response.selectedFilterId ? { filterId: response.selectedFilterId } : {}),
    };
    const nextRequestKey = buildProjectBacklogRequestKey(nextSelection);
    if (nextRequestKey !== buildProjectBacklogRequestKey(input.requestedSelection)) {
      refs.syncedSelectionRequestKeyRef.current = nextRequestKey;
    }
    input.onSelectionChange?.(nextSelection);
  });

  useEffect(() => {
    refs.lastLoadedAtRef.current = undefined;
    refs.lastFingerprintRef.current = null;
    refs.inFlightRequestRef.current = null;
    refs.autoRefreshCooldownUntilRef.current = 0;
    refs.autoRefreshBackoffMsRef.current = 0;
    refs.lastAutoRefreshKeyRef.current = null;
    refs.syncedSelectionRequestKeyRef.current = null;
    setPollingUpdatedAt(null);
  }, [input.projectId, input.connectedSource?.accountId, input.connectedSource?.externalProjectId]);

  const loadBacklog = useEffectEvent(
    async (selection?: BacklogSelectionInput, options?: BacklogLoadOptions) => {
      if (!input.backend) {
        return;
      }
      if (!input.connectedSource) {
        input.setBacklogState(createProjectBacklogState(input.projectId));
        setError("Missing Atlassian project connection for this backlog.");
        return;
      }

      const requestSelection = selection ?? input.currentSelection;
      const requestKey = buildProjectBacklogRequestKey(requestSelection, options);
      const inFlightRequest = refs.inFlightRequestRef.current;
      if (inFlightRequest?.key === requestKey) {
        return await inFlightRequest.promise;
      }

      const run = runProjectBacklogLoad({
        backend: input.backend,
        connectedSource: input.connectedSource,
        projectId: input.projectId,
        currentSelection: input.currentSelection,
        requestedSelection: input.requestedSelection,
        requestSelection,
        setBacklogState: input.setBacklogState,
        options,
        refs,
        setLoading,
        setError,
        setPollingUpdatedAt,
        applyBacklogResponse,
        loadBacklog,
      });

      refs.inFlightRequestRef.current = { key: requestKey, promise: run };
      try {
        await run;
      } finally {
        if (refs.inFlightRequestRef.current?.promise === run) {
          refs.inFlightRequestRef.current = null;
        }
      }
    },
  );

  useEffect(() => {
    const requestKey = buildProjectBacklogRequestKey(input.requestedSelection);
    if (
      shouldSkipProjectBacklogSelectionSyncReload({
        hasLoadedResponse: refs.lastFingerprintRef.current !== null,
        syncedRequestKey: refs.syncedSelectionRequestKeyRef.current,
        nextRequestKey: requestKey,
      })
    ) {
      refs.syncedSelectionRequestKeyRef.current = null;
      return;
    }

    void loadBacklog(input.requestedSelection);
  }, [input.backend, input.connectedSource, input.projectId, input.requestedSelection]);

  useEffect(() => {
    if (!input.backend || !input.connectedSource || pollingUpdatedAt === null) {
      return;
    }

    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: ATLASSIAN_BACKLOG_POLL_INTERVAL_MS,
      maxAgeMs: ATLASSIAN_BACKLOG_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => refs.lastLoadedAtRef.current ?? pollingUpdatedAt,
      poll: () =>
        loadBacklog(input.requestedSelection, {
          forceRefresh: true,
          silent: true,
          suppressError: true,
        }),
    });

    return () => poller.dispose();
  }, [input.backend, input.connectedSource, input.requestedSelection, pollingUpdatedAt]);

  return { loading, error, loadBacklog };
}
