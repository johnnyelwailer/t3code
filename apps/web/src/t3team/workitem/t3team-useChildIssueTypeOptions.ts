import { useEffect, useState } from "react";

import type { AtlassianChildIssueType } from "~/t3team/backend/t3team-types";

/**
 * Fetches the Jira-allowed child issue types once per mount (via `getChildIssueTypes`/createmeta,
 * never a hardcoded list) — shared by the backlog and work-item child-create forms, each supplying
 * its own already-scoped `fetch`.
 */
export function useChildIssueTypeOptions(input: {
  readonly enabled: boolean;
  readonly fetch: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
}) {
  const { enabled, fetch } = input;
  const [options, setOptions] = useState<ReadonlyArray<AtlassianChildIssueType>>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    // No `fetch` reachable at all: nothing to load, not stuck loading forever — the field then
    // shows its resolved default rather than a spinner with no fetch behind it.
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch()
      .then((types) => {
        if (!cancelled) setOptions(types);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fetch]);

  return { options, loading, error };
}
