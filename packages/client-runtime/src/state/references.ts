import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

/**
 * Query atoms for the "related threads" roster. The RPC answers the flat set of thread ids that
 * reference (work item) or link to (pull request) a target; live grouping (working/snoozed/
 * settled) is composed client-side against the live thread shells, so the atom only carries the
 * membership and is re-polled as links/claims change.
 */
export function createReferenceEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    linkedThreads: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:references:linked-threads",
      tag: WS_METHODS.referencesLinkedThreads,
      staleTimeMs: 0,
      refreshIntervalMs: 10_000,
    }),
  };
}
