import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";
import { persistStoredThreads } from "./t3team-projectThreadPersistence";
import {
  remapProjectThreadToStoredProject,
  syncLiveThreadMetadataToLocalState,
} from "./t3team-threadBridge";

export function useProjectStoreSyncEffects({
  threads,
  threadsHydrated,
  storedProjects,
  liveProjects,
  liveThreads,
  setThreads,
}: {
  threads: ProjectThread[];
  threadsHydrated: boolean;
  storedProjects: ProjectShellProject[];
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
  setThreads: Dispatch<SetStateAction<ProjectThread[]>>;
}) {
  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    persistStoredThreads(threads);
  }, [threads, threadsHydrated]);

  useEffect(() => {
    setThreads((currentThreads) => {
      let changed = false;
      const nextThreads = currentThreads.map((thread) => {
        const normalizedThread = remapProjectThreadToStoredProject(
          thread,
          storedProjects,
          liveProjects,
        );
        if (normalizedThread !== thread) {
          changed = true;
        }
        return normalizedThread;
      });
      return changed ? nextThreads : currentThreads;
    });
  }, [liveProjects, storedProjects]);

  useEffect(() => {
    if (liveThreads.length === 0) {
      return;
    }

    setThreads((currentThreads) =>
      syncLiveThreadMetadataToLocalState({
        threads: currentThreads,
        storedProjects,
        liveProjects,
        liveThreads,
      }),
    );
  }, [liveProjects, liveThreads, storedProjects]);
}
