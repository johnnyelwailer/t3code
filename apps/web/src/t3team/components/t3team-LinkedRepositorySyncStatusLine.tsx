import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { describeLinkedRepositorySyncStatus } from "~/t3team/components/t3team-linkedRepositorySyncStatus";

const TONE_CLASS = {
  muted: "text-muted-foreground",
  progress: "text-primary",
  ready: "text-muted-foreground",
  error: "text-destructive",
} as const;

/** A linked repository's checkout state under its row; nothing for a repository not saved yet. */
export function LinkedRepositorySyncStatusLine({
  entry,
}: {
  entry: LinkedRepositorySyncResult | undefined;
}) {
  if (!entry) return null;
  const view = describeLinkedRepositorySyncStatus(entry);
  return (
    <div className={`truncate text-2xs ${TONE_CLASS[view.tone]}`}>
      {view.label}
      {view.detail ? ` — ${view.detail}` : null}
    </div>
  );
}
