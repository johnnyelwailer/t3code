import { useMemo } from "react";
import type { EnvironmentId } from "@t3tools/contracts";

import { T3TeamOutboxQueueDock } from "~/t3team/outbox/t3team-outboxQueueDock";
import { useT3TeamOutboxStore } from "~/t3team/outbox/t3team-outboxStore";
import { useT3TeamOutboxDrain } from "~/t3team/outbox/t3team-useOutboxDrain";
import type { T3TeamOutboxBackend } from "~/t3team/outbox/t3team-useWorkflowOutboxActions";

/**
 * The viewed thread's waiting sends as a composer banner (`undefined` when none), and the drain
 * that delivers them on reconnect. Shared by every thread view that can queue offline, so a send
 * queued from one is never stranded without a drain.
 */
export function useT3TeamThreadOutboxDock(
  environmentId: EnvironmentId,
  threadId: string,
  backend: T3TeamOutboxBackend | null | undefined,
) {
  useT3TeamOutboxDrain({ environmentId, backend });
  const snapshot = useT3TeamOutboxStore();
  const entries = useMemo(
    () =>
      snapshot.entries.filter(
        (entry) => entry.environmentId === environmentId && entry.threadId === threadId,
      ),
    [snapshot.entries, environmentId, threadId],
  );
  // Re-built only when the outbox actually changes, so composer churn does not re-render it.
  return useMemo(
    () =>
      entries.length === 0 ? undefined : (
        <T3TeamOutboxQueueDock
          entries={entries}
          dispatchingEntryId={snapshot.dispatchingEntryId}
          failures={snapshot.failures}
        />
      ),
    [entries, snapshot.dispatchingEntryId, snapshot.failures],
  );
}
