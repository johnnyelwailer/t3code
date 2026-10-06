import { useCallback, useEffect, useRef, useState } from "react";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";

import type { JiraCatalogProject } from "./t3team-jiraProjectCatalog.logic";
import {
  fetchLiveJiraCatalog,
  readCachedCatalog,
  readCachedJiraAccounts,
} from "./t3team-useJiraProjectCatalog";

export type JiraCatalogState = {
  readonly catalog: ReadonlyArray<JiraCatalogProject>;
  /** A live read is in flight (cached rows, if any, are already shown). */
  readonly loading: boolean;
  /** Whether at least one Jira site is connected; null until that is known. */
  readonly connected: boolean | null;
  readonly error: unknown;
  /** Re-reads every site now, e.g. right after a sign-in. */
  readonly refresh: () => Promise<void>;
};

type Snapshot = Omit<JiraCatalogState, "refresh">;

function initialSnapshot(liveReadStarts: boolean): Snapshot {
  const catalog = readCachedCatalog();
  return {
    catalog,
    // True from the first render when a live read is about to start, so a screen never mistakes
    // "not read yet" for "not there".
    loading: liveReadStarts,
    connected: readCachedJiraAccounts().length > 0 ? true : null,
    error: null,
  };
}

/**
 * The Jira catalog for a surface that has to say what is going on — loading, not connected,
 * failed — rather than just show whatever it has (`useJiraProjectCatalog` is the quiet one the
 * sidebar uses). Cached rows render immediately; a live read follows on mount, and `refresh`
 * forces another.
 */
export function useJiraProjectCatalogState(): JiraCatalogState {
  const backend = useBackend();
  const [snapshot, setSnapshot] = useState<Snapshot>(() => initialSnapshot(Boolean(backend)));
  const mountedRef = useRef(true);
  // Reads can overlap (mount + a refresh after sign-in); only the newest one may land.
  const latestReadRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** One live read. The caller says whether `loading` is already on (it is on mount). */
  const read = useCallback(async () => {
    if (!backend) return;
    const readId = ++latestReadRef.current;
    const isCurrent = () => mountedRef.current && readId === latestReadRef.current;
    try {
      const live = await fetchLiveJiraCatalog(backend);
      if (!isCurrent()) return;
      setSnapshot({
        catalog: live.catalog,
        loading: false,
        connected: live.accounts.length > 0,
        error: null,
      });
    } catch (error) {
      if (!isCurrent()) return;
      setSnapshot((current) => ({ ...current, loading: false, error }));
    }
  }, [backend]);

  const refresh = useCallback(async () => {
    setSnapshot((current) => ({ ...current, loading: true, error: null }));
    await read();
  }, [read]);

  useEffect(() => {
    void read();
  }, [read]);

  return { ...snapshot, refresh };
}
