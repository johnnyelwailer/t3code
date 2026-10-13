import { useMemo } from "react";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { isLinkedRepositorySyncActive } from "~/t3team/components/t3team-linkedRepositorySyncStatus";
import { usePolledStatus } from "~/t3team/hooks/t3team-usePolledStatus";

const NO_ENTRIES: ReadonlyArray<LinkedRepositorySyncResult> = [];

/**
 * The linked repositories' recorded state and live background-sync phase for one workspace.
 * Reads a cheap status endpoint (no git on the server); polls only while a clone or fetch is
 * queued or running, and again after `refresh()` (call it after a save queues new syncs).
 */
export function useLinkedRepositorySyncStatus(input: {
  readonly workspaceRoot: string | undefined;
  readonly enabled: boolean;
}) {
  const { value: entries, refresh } = usePolledStatus({
    key: input.workspaceRoot,
    enabled: input.enabled,
    initial: NO_ENTRIES,
    read: async (backend, workspaceRoot) =>
      (await backend.projectWorkspace.readLinkedRepositoryStatus({ workspaceRoot }))
        .linkedRepositories,
    isActive: (linkedRepositories) => linkedRepositories.some(isLinkedRepositorySyncActive),
  });
  const byUrl = useMemo(() => new Map(entries.map((entry) => [entry.url, entry])), [entries]);
  return { byUrl, refresh };
}
