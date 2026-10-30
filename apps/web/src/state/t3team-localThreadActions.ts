import { isEnvironmentUnreachable } from "@t3tools/client-runtime/state/local-thread-overrides";
import type { EnvironmentId } from "@t3tools/contracts";

import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentPresentations } from "./presentation";

/**
 * Whether a thread's environment cannot be asked to settle or delete it (switched off, blocked
 * because its cloud session ended, or unknown). Those two actions then run on this device only,
 * so a thread whose environment is gone never stays stuck in the list.
 */
export function readEnvironmentUnreachable(environmentId: EnvironmentId): boolean {
  if (!appAtomRegistry.get(environmentCatalog.catalogValueAtom).isReady) return false;
  return isEnvironmentUnreachable(
    appAtomRegistry.get(environmentPresentations.presentationAtom(environmentId)),
  );
}

/** The menu actions that keep working on this device when the environment cannot be reached. */
export function isLocalThreadAction(action: string): boolean {
  return action === "settle" || action === "delete";
}
