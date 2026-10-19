import { useEffect, useState } from "react";

import { useBackend } from "~/t3team/backend/t3team-index";
import type {
  LinkedRepositoryBranches,
  LinkedRepositorySyncResult,
} from "~/t3team/backend/t3team-types";

/**
 * Which branch a linked repository's checkout follows, as a small picker on its card. The choices
 * are the branches the checkout already knows from its last fetch, so the list costs no network
 * and appears once the repository has been cloned. Nothing is shown when there is nothing to
 * choose between. `value` is the chosen branch, absent for the repository's default branch.
 */
export function LinkedRepositoryBranchControl({
  workspaceRoot,
  entry,
  value,
  onChange,
}: {
  readonly workspaceRoot: string | undefined;
  readonly entry: LinkedRepositorySyncResult | undefined;
  readonly value: string | undefined;
  readonly onChange: (branch: string | null) => void;
}) {
  const backend = useBackend();
  const [known, setKnown] = useState<LinkedRepositoryBranches | null>(null);
  const settled =
    entry !== undefined &&
    entry.syncState === undefined &&
    entry.status !== "pending" &&
    entry.status !== "not-cloned" &&
    entry.status !== "failed";
  const url = entry?.url;
  const syncedAt = entry?.syncedAt;

  useEffect(() => {
    if (!backend || !settled || !workspaceRoot || !url) return;
    let cancelled = false;
    void backend.projectWorkspace
      .listLinkedRepositoryBranches({ workspaceRoot, url })
      .then((result) => {
        if (!cancelled) setKnown(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend, settled, workspaceRoot, url, syncedAt]);

  if (!known || !url || (known.branches.length < 2 && value === undefined)) return null;
  const choices =
    value !== undefined && !known.branches.includes(value)
      ? [value, ...known.branches]
      : known.branches;
  const defaultLabel = known.defaultBranch ? `Default (${known.defaultBranch})` : "Default branch";

  return (
    <label className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
      <span className="shrink-0">Branch</span>
      <select
        aria-label={`Branch for ${url}`}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        className="min-w-0 flex-1 truncate rounded border border-input bg-background px-1 py-0.5 text-2xs text-foreground"
      >
        <option value="">{defaultLabel}</option>
        {choices.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>
    </label>
  );
}
