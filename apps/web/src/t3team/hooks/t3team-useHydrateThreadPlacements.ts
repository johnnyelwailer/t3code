import { useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import { useBackend, useBackendState } from "~/t3team/backend/t3team-index";
import type { T3TeamThreadPlacement } from "~/t3team/backend/t3team-types";
import { upsertProjectThreadLocalState } from "~/t3team/t3team-threadToolContext";
import type { ProjectThread } from "~/t3team/t3team-types";
import { readT3TeamThreadPlacementFromActivities } from "~/t3team/hooks/t3team-threadHandoffMetadata";

import { mapLiveThreadToProjectThread, resolveStoredProjectId } from "./t3team-threadBridge";

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
    const livePlacement = readT3TeamThreadPlacementFromActivities(thread);
    return existingThread?.parentThreadId ||
      existingThread?.ticketId ||
      livePlacement.parentThreadId ||
      livePlacement.ticketId
      ? []
      : [thread.id];
  });
}

/**
 * Drops ids whose last "no placement" answer is still current, i.e. the live
 * thread's `updatedAt` has not moved since the server answered (GHE #382).
 */
export function filterUnresolvedThreadPlacementIds(input: {
  threadIds: ReadonlyArray<string>;
  liveThreads: ReadonlyArray<Pick<Thread, "id" | "updatedAt">>;
  resolvedEmpty: ReadonlyMap<string, string>;
}): string[] {
  if (input.resolvedEmpty.size === 0) {
    return [...input.threadIds];
  }
  const updatedAtById = new Map(
    input.liveThreads.map((thread) => [thread.id as string, thread.updatedAt] as const),
  );
  return input.threadIds.filter(
    (threadId) => input.resolvedEmpty.get(threadId) !== updatedAtById.get(threadId),
  );
}

export function mergeFetchedThreadPlacements(input: {
  threads: ReadonlyArray<ProjectThread>;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
  placements: ReadonlyArray<T3TeamThreadPlacement>;
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
  // Thread ids the server has already answered for with no placement. Most
  // threads legitimately have no parent or ticket, and the server omits them
  // from its response, so without this they would stay "missing" forever and
  // be re-sent on every candidate-set change or reconnect (GHE #382).
  // Keyed by thread id → the thread's `updatedAt` when the empty answer came
  // back. Any later update to the thread (a handoff lands, an activity is
  // recorded) advances `updatedAt` and makes the id eligible again.
  const resolvedEmptyThreadIdsRef = useRef<Map<string, string>>(new Map());
  const candidateThreadIds = useMemo(
    () =>
      filterUnresolvedThreadPlacementIds({
        threadIds: readMissingThreadPlacementIds({ threads, liveThreads }),
        liveThreads,
        resolvedEmpty: resolvedEmptyThreadIdsRef.current,
      }),
    [liveThreads, threads],
  );
  // JSON.stringify (not `.join`) so an embedded delimiter inside a thread id
  // can't collide two distinct candidate sets onto the same dependency key —
  // e.g. `["a\nb", "c"]` vs `["a", "b\nc"]` would otherwise both join to
  // "a\nb\nc".
  const candidateThreadIdsKey = JSON.stringify(candidateThreadIds);

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

    // Filter again here, not only in the memo: the memo does not re-run when
    // the ref changes, so a `connectionStatus` bounce would otherwise re-send
    // the pre-suppression list.
    const requestedThreadIds = filterUnresolvedThreadPlacementIds({
      threadIds: candidateThreadIds,
      liveThreads,
      resolvedEmpty: resolvedEmptyThreadIdsRef.current,
    });
    if (requestedThreadIds.length === 0) {
      return () => {
        cancelled = true;
      };
    }
    const requestedUpdatedAt = new Map(
      liveThreads
        .filter((thread) => requestedThreadIds.includes(thread.id))
        .map((thread) => [thread.id as string, thread.updatedAt] as const),
    );

    void backend
      .listThreadPlacements({ threadIds: requestedThreadIds })
      .then((placements) => {
        if (cancelled) {
          return;
        }
        const placedThreadIds = new Set<string>(placements.map((placement) => placement.threadId));
        for (const threadId of requestedThreadIds) {
          const updatedAt = requestedUpdatedAt.get(threadId);
          if (!placedThreadIds.has(threadId) && updatedAt !== undefined) {
            resolvedEmptyThreadIdsRef.current.set(threadId, updatedAt);
          }
        }
        if (placements.length === 0) {
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
    // `candidateThreadIds` is intentionally omitted: it is a freshly derived
    // array on every render (new identity each time even when its contents
    // are unchanged), so including it would re-run this effect — and refetch
    // placements — on every re-render instead of only when the actual set of
    // candidate ids changes. `candidateThreadIdsKey` is the stable,
    // content-based dependency; the effect body still reads the up-to-date
    // `candidateThreadIds` value via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    backend,
    backendState.connectionStatus,
    candidateThreadIdsKey,
    liveProjects,
    liveThreads,
    setThreads,
    storedProjects,
  ]);
}
