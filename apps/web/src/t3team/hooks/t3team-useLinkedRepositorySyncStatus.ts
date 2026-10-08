import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [generation, setGeneration] = useState(0);
  const { workspaceRoot, enabled } = input;

  useEffect(() => {
    if (!backend || !enabled || !workspaceRoot) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await backend.projectWorkspace.readLinkedRepositoryStatus({ workspaceRoot });
        if (cancelled) return;
        setEntries(result.linkedRepositories);
        if (result.linkedRepositories.some(isLinkedRepositorySyncActive)) {
          timer = setTimeout(() => void poll(), ACTIVE_POLL_MS);
        }
      } catch {
        if (!cancelled) timer = setTimeout(() => void poll(), ERROR_RETRY_MS);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [backend, enabled, workspaceRoot, generation]);

  const byUrl = useMemo(() => new Map(entries.map((entry) => [entry.url, entry])), [entries]);
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  return { byUrl, refresh };
}
