import { useState } from "react";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { Button } from "~/t3team/components/ui/t3team-button";
import {
  describeLinkedRepositorySyncStatus,
  isLinkedRepositorySyncActive,
} from "~/t3team/components/t3team-linkedRepositorySyncStatus";

const TONE_CLASS = {
  muted: "text-muted-foreground",
  progress: "text-primary",
  ready: "text-muted-foreground",
  error: "text-destructive",
} as const;

/** A linked repository's checkout state under its row, with "Sync now" (clone or fetch it — linked
 * repositories sync on demand) while no sync runs. Nothing for a repository not saved yet. */
export function LinkedRepositorySyncStatusLine({
  entry,
  onSync,
}: {
  entry: LinkedRepositorySyncResult | undefined;
  onSync?: (url: string) => Promise<void>;
}) {
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  if (!entry) return null;
  const view = describeLinkedRepositorySyncStatus(entry);
  const syncNow = () => {
    if (!onSync) return;
    setStarting(true);
    setStartError(null);
    onSync(entry.url)
      .catch((error: unknown) =>
        setStartError(error instanceof Error ? error.message : "The sync could not start."),
      )
      .finally(() => setStarting(false));
  };
  return (
    <span className="flex min-w-0 items-center gap-2 text-2xs">
      <span className={`truncate ${TONE_CLASS[view.tone]}`}>
        {view.label}
        {view.detail ? ` — ${view.detail}` : null}
        {startError ? ` — ${startError}` : null}
      </span>
      {onSync && !isLinkedRepositorySyncActive(entry) ? (
        <Button size="xs" variant="link" disabled={starting} onClick={syncNow}>
          Sync now
        </Button>
      ) : null}
    </span>
  );
}
