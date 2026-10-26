import type { EnvironmentId } from "@t3tools/contracts";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { type CloudSessionListState, useCloudSessions } from "~/state/t3team-cloudSessions";

import { environmentMayBeCloudSessionMachine } from "./t3team-cloudSessionListDemand";

/**
 * The cloud session list for a thread's environment: loaded only where that environment can be a
 * cloud session's machine, so a thread on the user's own machine never asks for it.
 */
export function useCloudSessionsOfMachine(
  environmentId: EnvironmentId | null,
): CloudSessionListState {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return useCloudSessions(environmentMayBeCloudSessionMachine(environmentId, primaryEnvironmentId));
}
