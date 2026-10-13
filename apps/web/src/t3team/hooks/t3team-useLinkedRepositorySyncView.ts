import { useCallback, useMemo, useState } from "react";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import {
  buildSyncSteps,
  type LinkedRepositorySavePhase,
} from "~/t3team/components/t3team-linkedRepositorySyncSteps";

/**
 * State behind the linked-repositories "syncing" view: the save's current phase, whether the view
 * is showing, and the steps derived from both plus the server's live clone status. Dismissing it
 * only hides it — the sync keeps running on the server.
 */
export function useLinkedRepositorySyncView(input: {
  readonly urls: ReadonlyArray<string>;
  readonly byUrl: ReadonlyMap<string, LinkedRepositorySyncResult>;
  readonly mainRepositoryUrl: string | null | undefined;
}) {
  const [phase, setPhase] = useState<LinkedRepositorySavePhase>("saving");
  const [visible, setVisible] = useState(false);
  const { urls, byUrl, mainRepositoryUrl } = input;
  const steps = useMemo(
    () =>
      buildSyncSteps({
        phase,
        urls,
        byUrl,
        ...(mainRepositoryUrl !== undefined ? { mainRepositoryUrl } : {}),
      }),
    [phase, urls, byUrl, mainRepositoryUrl],
  );
  const begin = useCallback(() => {
    setPhase("saving");
    setVisible(true);
  }, []);
  const hide = useCallback(() => setVisible(false), []);
  return { phase, setPhase, visible, begin, hide, steps };
}
