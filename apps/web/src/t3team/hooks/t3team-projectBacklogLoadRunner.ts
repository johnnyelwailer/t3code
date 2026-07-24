import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AtlassianBacklogResponse, BackendApi } from "~/t3team/backend/t3team-types";
import { asT3TeamPollingBackend } from "~/t3team/backend/t3team-pollingBackend";

import {
  fingerprintProjectBacklog,
  type BacklogSelectionInput,
} from "./t3team-projectBacklogCache";
import { listProjectBacklog, pollProjectBacklog } from "./t3team-projectBacklogRemote";
import {
  buildProjectBacklogAutoRefreshKey,
  nextProjectBacklogAutoRefreshBackoffMs,
  shouldAutoRefreshPersistedProjectBacklog,
  shouldPollProjectBacklog,
  type BacklogLoadOptions,
} from "./t3team-projectBacklogPolling";
import type { ProjectBacklogState } from "./t3team-projectBacklogState";
import type { ConnectedBacklogSource } from "./t3team-projectBacklogMutations";

type LoaderRefs = {
  loadRequestIdRef: MutableRefObject<number>;
  visibleLoadRequestIdRef: MutableRefObject<number>;
  lastLoadedAtRef: MutableRefObject<number | undefined>;
  lastFingerprintRef: MutableRefObject<string | null>;
  inFlightRequestRef: MutableRefObject<{ key: string; promise: Promise<void> } | null>;
  autoRefreshCooldownUntilRef: MutableRefObject<number>;
  autoRefreshBackoffMsRef: MutableRefObject<number>;
  lastAutoRefreshKeyRef: MutableRefObject<string | null>;
  syncedSelectionRequestKeyRef: MutableRefObject<string | null>;
};

export function runProjectBacklogLoad(input: {
  backend: BackendApi;
  connectedSource: ConnectedBacklogSource;
  projectId: string;
  currentSelection: BacklogSelectionInput;
  requestedSelection: BacklogSelectionInput;
  requestSelection: BacklogSelectionInput;
  setBacklogState: Dispatch<SetStateAction<ProjectBacklogState>>;
  options: BacklogLoadOptions | undefined;
  refs: LoaderRefs;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setPollingUpdatedAt: Dispatch<SetStateAction<number | null>>;
  applyBacklogResponse: (response: AtlassianBacklogResponse) => void;
  loadBacklog: (selection?: BacklogSelectionInput, options?: BacklogLoadOptions) => Promise<void>;
}) {
  const isAutomaticForceRefresh = Boolean(
    input.options?.forceRefresh &&
    input.options?.silent &&
    input.options?.suppressError &&
    !input.options?.clearProjectCache,
  );
  if (isAutomaticForceRefresh && Date.now() < input.refs.autoRefreshCooldownUntilRef.current) {
    return Promise.resolve();
  }

  return (async () => {
    const visibleLoadRequestId = input.options?.silent
      ? null
      : input.refs.visibleLoadRequestIdRef.current + 1;
    if (visibleLoadRequestId !== null) {
      input.refs.visibleLoadRequestIdRef.current = visibleLoadRequestId;
      input.setLoading(true);
    }
    if (!input.options?.suppressError) {
      input.setError(null);
    }

    const requestId = input.refs.loadRequestIdRef.current + 1;
    input.refs.loadRequestIdRef.current = requestId;

    try {
      const pollingBackend = asT3TeamPollingBackend(input.backend);
      const shouldUsePoll = shouldPollProjectBacklog({
        ...(input.options ? { options: input.options } : {}),
        fingerprint: input.refs.lastFingerprintRef.current,
        pollingAvailable: Boolean(pollingBackend),
      });
      const response =
        shouldUsePoll && pollingBackend
          ? await loadPolledBacklog({
              backend: pollingBackend.atlassian,
              connectedSource: input.connectedSource,
              requestSelection: input.requestSelection,
              knownFingerprint: input.refs.lastFingerprintRef.current,
              requestId,
              currentRequestId: input.refs.loadRequestIdRef.current,
              refs: input.refs,
              setPollingUpdatedAt: input.setPollingUpdatedAt,
            })
          : await listProjectBacklog({
              backend: input.backend.atlassian,
              source: input.connectedSource,
              selection: input.requestSelection,
              ...(input.options?.forceRefresh ? { forceRefresh: true } : {}),
              ...(input.options?.clearProjectCache ? { clearProjectCache: true } : {}),
            });

      if (requestId !== input.refs.loadRequestIdRef.current || !response) {
        return;
      }

      const nextFingerprint = fingerprintProjectBacklog(response);
      if (input.refs.lastFingerprintRef.current !== nextFingerprint) {
        input.applyBacklogResponse(response);
      } else {
        const updatedAt = response.cache?.updatedAt ?? Date.now();
        input.refs.lastLoadedAtRef.current = updatedAt;
        input.setPollingUpdatedAt(updatedAt);
      }

      if (input.options?.forceRefresh) {
        input.refs.autoRefreshCooldownUntilRef.current = 0;
        input.refs.autoRefreshBackoffMsRef.current = 0;
        input.refs.lastAutoRefreshKeyRef.current = buildProjectBacklogAutoRefreshKey(
          input.requestSelection,
          nextFingerprint,
        );
      }

      if (response.cache?.source === "stale-fallback") {
        if (!input.options?.suppressError) {
          input.setError("Failed to refresh backlog. Showing cached data.");
        }
        return;
      }

      if (
        shouldAutoRefreshPersistedProjectBacklog({
          cacheSource: response.cache?.source,
          selection: input.requestSelection,
          fingerprint: nextFingerprint,
          ...(input.options?.forceRefresh ? { forceRefresh: true } : {}),
          nowMs: Date.now(),
          cooldownUntilMs: input.refs.autoRefreshCooldownUntilRef.current,
          lastAutoRefreshKey: input.refs.lastAutoRefreshKeyRef.current,
          inFlightRequestKey: input.refs.inFlightRequestRef.current?.key ?? null,
        })
      ) {
        input.refs.lastAutoRefreshKeyRef.current = buildProjectBacklogAutoRefreshKey(
          input.requestSelection,
          nextFingerprint,
        );
        void input.loadBacklog(input.requestSelection, {
          forceRefresh: true,
          silent: true,
          suppressError: true,
        });
      }
    } catch (cause) {
      if (requestId !== input.refs.loadRequestIdRef.current) {
        return;
      }

      if (isAutomaticForceRefresh) {
        const nextBackoffMs = nextProjectBacklogAutoRefreshBackoffMs(
          input.refs.autoRefreshBackoffMsRef.current,
        );
        input.refs.autoRefreshBackoffMsRef.current = nextBackoffMs;
        input.refs.autoRefreshCooldownUntilRef.current = Date.now() + nextBackoffMs;
      }

      if (!input.options?.suppressError) {
        input.setError(cause instanceof Error ? cause.message : "Failed to load backlog.");
      }
    } finally {
      if (
        visibleLoadRequestId !== null &&
        visibleLoadRequestId === input.refs.visibleLoadRequestIdRef.current
      ) {
        input.setLoading(false);
      }
    }
  })();
}

async function loadPolledBacklog(input: {
  backend: NonNullable<ReturnType<typeof asT3TeamPollingBackend>>["atlassian"];
  connectedSource: ConnectedBacklogSource;
  requestSelection: BacklogSelectionInput;
  knownFingerprint: string | null;
  requestId: number;
  currentRequestId: number;
  refs: LoaderRefs;
  setPollingUpdatedAt: Dispatch<SetStateAction<number | null>>;
}) {
  const pollResult = await pollProjectBacklog({
    backend: input.backend,
    source: input.connectedSource,
    selection: input.requestSelection,
    ...(input.knownFingerprint ? { knownFingerprint: input.knownFingerprint } : {}),
  });
  if (!pollResult.unchanged) {
    return pollResult.value;
  }
  if (input.requestId === input.currentRequestId) {
    const updatedAt = Date.now();
    input.refs.lastLoadedAtRef.current = updatedAt;
    input.setPollingUpdatedAt(updatedAt);
    input.refs.autoRefreshCooldownUntilRef.current = 0;
    input.refs.autoRefreshBackoffMsRef.current = 0;
  }
  return null;
}
