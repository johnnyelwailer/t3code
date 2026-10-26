import type { CloudSession } from "@t3tools/contracts";
import type { Atom, AtomRegistry } from "effect/reactivity";

import { waitForAtomValue } from "~/state/waitForAtomValue";

/** How long a broker attach waits for the session list before it goes without a deadline. */
export const BROKER_ATTACH_LIST_WAIT_MS = 5_000;

/**
 * The cloud sessions a broker attach reads its deadline from. The list loads only for a surface or
 * a bound session, so an attach to a session nobody has listed yet asks for it and waits (bounded)
 * rather than reading an unloaded list as "no sessions"; a loaded list is read as it is.
 */
export async function readSessionsForBrokerAttach(input: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly list: Atom.Atom<{
    readonly sessions: ReadonlyArray<CloudSession>;
    readonly loading: boolean;
  }>;
  readonly waitMs?: number;
}): Promise<ReadonlyArray<CloudSession>> {
  await waitForAtomValue({
    registry: input.registry,
    atom: input.list,
    predicate: (state) => !state.loading,
    timeoutMs: input.waitMs ?? BROKER_ATTACH_LIST_WAIT_MS,
  });
  return input.registry.get(input.list).sessions;
}
