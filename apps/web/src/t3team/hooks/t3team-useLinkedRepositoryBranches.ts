import { useCallback, useMemo, useState } from "react";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";

/** The branch each linked repository will be on after a save, and whether that differs from now. */
export function resolveLinkedBranches(input: {
  readonly urls: ReadonlyArray<string>;
  /** What the user picked in this dialog: a branch, or null for the default branch. */
  readonly choices: Readonly<Record<string, string | null>>;
  readonly recorded: ReadonlyMap<string, LinkedRepositorySyncResult>;
}): { readonly branches: Readonly<Record<string, string>>; readonly changed: boolean } {
  const branches: Record<string, string> = {};
  let changed = false;
  for (const url of input.urls) {
    const recorded = input.recorded.get(url)?.branch;
    const chosen = url in input.choices ? (input.choices[url] ?? undefined) : recorded;
    if (chosen !== undefined) branches[url] = chosen;
    if (chosen !== recorded) changed = true;
  }
  return { branches, changed };
}

/** The dialog's branch choices on top of what the server has recorded for each checkout. */
export function useLinkedRepositoryBranches(input: {
  readonly urls: ReadonlyArray<string>;
  readonly recorded: ReadonlyMap<string, LinkedRepositorySyncResult>;
}) {
  const [choices, setChoices] = useState<Readonly<Record<string, string | null>>>({});
  const { urls, recorded } = input;
  const resolved = useMemo(
    () => resolveLinkedBranches({ urls, choices, recorded }),
    [urls, choices, recorded],
  );
  const setBranch = useCallback(
    (url: string, branch: string | null) =>
      setChoices((current) => ({ ...current, [url]: branch })),
    [],
  );
  const branchFor = useCallback(
    (url: string): string | undefined => resolved.branches[url],
    [resolved],
  );
  return { branches: resolved.branches, changed: resolved.changed, setBranch, branchFor };
}
