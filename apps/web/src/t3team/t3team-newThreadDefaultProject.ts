import type { ScopedProjectRef } from "@t3tools/contracts";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentPresentations } from "../state/presentation";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { readT3TeamPillScope } from "./t3team-pillScope";

/**
 * Event-time twin of what `useHandleNewThread` computes during render: the pill scope (project and
 * environment) and the environments that cannot take a new thread right now. Keyboard commands run outside
 * React, so they read the stores instead of subscribing. This computer always counts as
 * reachable, even while it is still connecting at startup.
 */
export function readT3TeamDefaultProjectScope(): {
  readonly scopedProjectRefs: ReadonlyArray<ScopedProjectRef> | null;
  readonly offlineEnvironmentIds: ReadonlySet<string>;
  readonly preferredEnvironmentId: string | null;
} {
  const primaryEnvironmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  const offlineEnvironmentIds = new Set<string>();
  for (const [environmentId, presentation] of appAtomRegistry.get(
    environmentPresentations.presentationsAtom,
  )) {
    if (presentation.connection.phase !== "connected" && environmentId !== primaryEnvironmentId) {
      offlineEnvironmentIds.add(environmentId);
    }
  }
  const scope = readT3TeamPillScope();
  return {
    scopedProjectRefs: scope.projectRefs,
    offlineEnvironmentIds,
    preferredEnvironmentId: scope.environmentId,
  };
}
