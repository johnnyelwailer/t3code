import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { isLinkedRepositorySyncActive } from "~/t3team/components/t3team-linkedRepositorySyncStatus";

const ACTIVE_POLL_MS = 2_000;
const ERROR_RETRY_MS = 10_000;

/**
 * The linked repositories' recorded state and live background-sync phase for one workspace.
 * Reads a cheap status endpoint (no git on the server); polls only while a clone or fetch is
 * queued or running, and again after `refresh()` (call it after a save queues new syncs).
 */
export function useLinkedRepositorySyncStatus(input: {
  readonly workspaceRoot: string | undefined;
  readonly enabled: boolean;
}) {
  const backend = useBackend();
  const [entries, setEntries] = useState<ReadonlyArray<LinkedRepositorySyncResult>>([]);
  const restartRef = useRef<() => void>(() => {});
  const { workspaceRoot, enabled } = input;

  useEffect(() => {
    if (!backend || !enabled || !workspaceRoot) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only the latest poll chain may schedule the next poll (a restart supersedes one in flight).
    let chain = 0;
    const poll = async () => {
      const current = ++chain;
      try {
        const result = await backend.projectWorkspace.readLinkedRepositoryStatus({ workspaceRoot });
        if (cancelled || current !== chain) return;
        setEntries(result.linkedRepositories);
        if (result.linkedRepositories.some(isLinkedRepositorySyncActive)) {
          timer = setTimeout(() => void poll(), ACTIVE_POLL_MS);
        }
      } catch {
        if (!cancelled && current === chain) timer = setTimeout(() => void poll(), ERROR_RETRY_MS);
      }
    };
    restartRef.current = () => {
      if (timer) clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [backend, enabled, workspaceRoot]);

  const byUrl = useMemo(() => new Map(entries.map((entry) => [entry.url, entry])), [entries]);
  const refresh = useCallback(() => restartRef.current(), []);
  return { byUrl, refresh };
}
