import { createEnvironmentUnreachableReader } from "@t3tools/client-runtime/state/local-thread-overrides";

import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";

/**
 * Whether a thread's environment cannot be asked to settle or delete it (its cloud session ended,
 * or it is unknown). Those two actions then run on this device only, so a thread whose
 * environment is gone never stays stuck in the list.
 */
export const readEnvironmentUnreachable = createEnvironmentUnreachableReader({
  registry: appAtomRegistry,
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  stateAtom: environmentCatalog.stateAtom,
});

/** The menu actions that keep working on this device when the environment cannot be reached. */
export function isLocalThreadAction(action: string): boolean {
  return action === "settle" || action === "delete";
}
