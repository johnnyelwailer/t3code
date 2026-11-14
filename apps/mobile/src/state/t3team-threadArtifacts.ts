import {
  createT3TeamThreadArtifactsAtoms,
  EMPTY_T3TEAM_THREAD_ARTIFACTS,
  type T3TeamThreadArtifacts,
} from "@t3tools/client-runtime/state/thread-artifacts";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";

/**
 * The mobile app's one instance of the fork thread-artifacts stream (the same client-runtime atoms
 * the web uses). Capability-gated there: against a server without `t3team.threadArtifacts` (every
 * stock upstream server) it settles on an empty list and never sends the fork RPC.
 */
export const t3teamThreadArtifactsAtoms = createT3TeamThreadArtifactsAtoms(connectionAtomRuntime);

/** One thread's fork artifacts in timeline order; empty while loading or unsupported. */
export function useT3TeamThreadArtifacts(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): T3TeamThreadArtifacts {
  const { data } = useEnvironmentQuery(
    t3teamThreadArtifactsAtoms.artifacts({ environmentId, input: { threadId } }),
  );
  return data ?? EMPTY_T3TEAM_THREAD_ARTIFACTS;
}
