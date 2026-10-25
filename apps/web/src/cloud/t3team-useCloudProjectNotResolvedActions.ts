import type { ProjectId } from "@t3tools/contracts";
import { useMemo } from "react";

import { isProjectNotResolved, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  sendQueuedInMachineProject,
  startPlainSessionForQueuedSend,
} from "./t3team-cloudQueuedSendRecovery";

export interface CloudQueuedSendRecoveryAction {
  readonly id: "machine-project" | "plain-session";
  readonly label: string;
  readonly onClick: () => void;
}

/**
 * The extra ways out of a send that gave up waiting for its project, beside Retry and Cancel (the
 * composer banner and the thread card both list them). Empty for any other state.
 */
export function useCloudProjectNotResolvedActions(input: {
  readonly draftId: string | null;
  readonly queued: CloudQueuedSend | null;
  readonly scopeKey: string | null;
  readonly projectKey: string | null;
  /** The draft's project when it is on the primary environment, else undefined. */
  readonly projectId: ProjectId | undefined;
  readonly onCreate: (projectId?: ProjectId, options?: { readonly plain?: boolean }) => void;
}): ReadonlyArray<CloudQueuedSendRecoveryAction> {
  const { draftId, queued, scopeKey, projectKey, projectId, onCreate } = input;
  const applicable = draftId !== null && queued !== null && isProjectNotResolved(queued);
  return useMemo(() => {
    if (!applicable) return [];
    const actions: CloudQueuedSendRecoveryAction[] = [
      {
        id: "machine-project",
        label: "Send in the machine's project",
        onClick: () => sendQueuedInMachineProject(draftId),
      },
    ];
    if (projectId !== undefined && scopeKey !== null) {
      actions.push({
        id: "plain-session",
        label: "Start a plain session",
        onClick: () =>
          void startPlainSessionForQueuedSend({
            draftId,
            scopeKey,
            projectKey,
            projectId,
            onCreate,
          }),
      });
    }
    return actions;
  }, [applicable, draftId, onCreate, projectId, projectKey, scopeKey]);
}
