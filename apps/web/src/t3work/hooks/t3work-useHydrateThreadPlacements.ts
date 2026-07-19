import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import { useBackend, useBackendState } from "~/t3work/backend/t3work-index";
import type { T3workThreadPlacement } from "~/t3work/backend/t3work-types";
import { upsertProjectThreadLocalState } from "~/t3work/t3work-threadToolContext";
import type { ProjectThread } from "~/t3work/t3work-types";
import { readT3workThreadPlacementFromActivities } from "~/t3work/hooks/t3work-threadHandoffMetadata";

import { mapLiveThreadToProjectThread, resolveStoredProjectId } from "./t3work-threadBridge";

export function readMissingThreadPlacementIds(input: {
  threads: ReadonlyArray<ProjectThread>;
  liveThreads: ReadonlyArray<Thread>;
}): string[] {
  const existingThreads = new Map(input.threads.map((thread) => [thread.id, thread] as const));

  return input.liveThreads.flatMap((thread) => {
    if (thread.retention === "ephemeral") {
      return [];
    }
    const existingThread = existingThreads.get(thread.id);
    const livePlacement = readT3workThreadPlacementFromActivities(thread);
    return existingThread?.parentThreadId ||
      existingThread?.ticketId ||
      livePlacement.parentThreadId ||
      livePlacement.ticketId
      ? []
      : [thread.id];
  });
}

export function mergeFetchedThreadPlacements(input: {
  threads: ReadonlyArray<ProjectThread>;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
  placements: ReadonlyArray<T3workThreadPlacement>;
}): ProjectThread[] {
  const liveThreadById = new Map(input.liveThreads.map((thread) => [thread.id, thread] as const));
  let nextThreads = input.threads as ProjectThread[];

  for (const placement of input.placements) {
    const liveThread = liveThreadById.get(placement.threadId);
    if (!liveThread || liveThread.retention === "ephemeral") {
      continue;
    }

    const shadowThread = {
      ...mapLiveThreadToProjectThread(
        liveThread,
        resolveStoredProjectId(liveThread.projectId, input.storedProjects, input.liveProjects),
      ),
      ...(placement.parentThreadId ? { parentThreadId: placement.parentThreadId } : {}),
      ...(placement.ticketId ? { ticketId: placement.ticketId } : {}),
    } satisfies ProjectThread;

    if (!shadowThread.parentThreadId && !shadowThread.ticketId) {
      continue;
    }

    nextThreads = upsertProjectThreadLocalState(nextThreads, shadowThread);
  }

  return nextThreads;
}

export function useHydrateThreadPlacements(input: {
  threads: ReadonlyArray<ProjectThread>;
  setThreads: Dispatch<SetStateAction<ProjectThread[]>>;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
}) {
  const backend = useBackend();
  const backendState = useBackendState();
  const { liveProjects, liveThreads, setThreads, storedProjects, threads } = input;
  const candidateThreadIds = useMemo(
    () =>
      readMissingThreadPlacementIds({
        threads,
        liveThreads,
      }),
    [liveThreads, threads],
  );
  const candidateThreadIdsKey = candidateThreadIds.join("\n");

  useEffect(() => {
    let cancelled = false;

    if (
      !backend ||
      backendState.connectionStatus !== "connected" ||
      candidateThreadIds.length === 0
    ) {
      return () => {
        cancelled = true;
      };
    }

    void backend
      .listThreadPlacements({ threadIds: candidateThreadIds })
      .then((placements) => {
        if (cancelled || placements.length === 0) {
          return;
        }

        setThreads((currentThreads) =>
          mergeFetchedThreadPlacements({
            threads: currentThreads,
            storedProjects,
            liveProjects,
            liveThreads,
            placements,
          }),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    backend,
    backendState.connectionStatus,
    candidateThreadIds,
    candidateThreadIdsKey,
    liveProjects,
    liveThreads,
    setThreads,
    storedProjects,
  ]);
}
