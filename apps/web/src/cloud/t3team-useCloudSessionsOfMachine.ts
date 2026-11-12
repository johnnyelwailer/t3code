import type { EnvironmentId } from "@t3tools/contracts";

import { useEnvironmentPresentation } from "~/state/presentation";
import { type CloudSessionListState, useCloudSessions } from "~/state/t3team-cloudSessions";

import { environmentMayBeCloudSessionMachine } from "./t3team-cloudSessionListDemand";

/**
 * The cloud session list for a thread's environment: loaded only where that environment can be a
 * cloud session's machine (a relay or broker connection), so a thread on the user's own machine,
 * an SSH host or a saved backend never asks for it.
 */
export function useCloudSessionsOfMachine(
  environmentId: EnvironmentId | null,
): CloudSessionListState {
  const { presentation } = useEnvironmentPresentation(environmentId);
  return useCloudSessions(
    environmentMayBeCloudSessionMachine(presentation?.entry.target._tag ?? null),
  );
}
