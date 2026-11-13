import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";
import { LinkedRepositorySyncStatusLine } from "~/t3team/components/t3team-LinkedRepositorySyncStatusLine";
import { useLinkedRepositorySyncStatus } from "~/t3team/hooks/t3team-useLinkedRepositorySyncStatus";

/**
 * Non-blocking per-repository clone/sync status for a project's workspace: chips on the
 * project view so Add can leave immediately and clones are visible without a progress screen.
 * A failed repository offers a single Retry.
 */
export function LinkedRepositorySyncChips({
  workspaceRoot,
}: {
  readonly workspaceRoot: string | undefined;
}) {
  const { byUrl, syncNow } = useLinkedRepositorySyncStatus({
    workspaceRoot,
    enabled: Boolean(workspaceRoot),
  });
  const entries = [...byUrl.values()];
  if (entries.length === 0) return null;
  return (
    <ul
      data-testid="linked-repository-sync-chips"
      className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2"
    >
      {entries.map((entry) => (
        <li
          key={entry.url}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1"
        >
          <span className="truncate text-xs font-medium">{parseRepositoryLabel(entry.url)}</span>
          <LinkedRepositorySyncStatusLine entry={entry} onSync={syncNow} />
        </li>
      ))}
    </ul>
  );
}
