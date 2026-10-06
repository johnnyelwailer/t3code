import { useAtomValue } from "@effect/atom-react";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { environmentCatalog } from "~/connection/catalog";
import { useAtomCommand } from "~/state/use-atom-command";
import { endedCloudSessionEnvironments } from "./t3team-endedCloudSessionEnvironments";

/**
 * Removes the saved environment of a cloud session once the server's session list shows it ended
 * (see `endedCloudSessionEnvironments`). Runs only on a loaded list, and asks once per environment:
 * several surfaces mount the controller, and a removal is idempotent but not free.
 */
export function useRetireEndedCloudSessionEnvironments(
  sessions: ReadonlyArray<CloudSession>,
  loading: boolean,
) {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const remove = useAtomCommand(environmentCatalog.remove, { reportFailure: false });
  const requested = useRef(new Set<EnvironmentId>());
  useEffect(() => {
    if (loading || !catalog.isReady) return;
    for (const environmentId of endedCloudSessionEnvironments(catalog.entries, sessions)) {
      if (requested.current.has(environmentId)) continue;
      requested.current.add(environmentId);
      void remove(environmentId);
    }
  }, [catalog, loading, remove, sessions]);
}
