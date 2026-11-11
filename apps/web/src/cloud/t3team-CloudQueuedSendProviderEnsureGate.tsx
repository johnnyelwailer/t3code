/**
 * Once project checkout is done, publishes the composer-selected provider's readiness into the
 * store the flusher waits on. It does NOT install or sign in: an automatic attempt shared the
 * user's serial lane keyed `[environmentId, tool]` and swallowed their clicks, and it dropped the
 * refusal the server returns as a success value. Only the card does that now, and it reports it.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";

import { useEnvironmentProviders } from "~/state/environments";
import { useToolAuthStates } from "~/state/t3team-toolauth";

import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { resolveCloudQueuedSendProviderGate } from "./t3team-cloudQueuedSendProviderGate";
import {
  clearCloudQueuedSendProviderReady,
  setCloudQueuedSendProviderReady,
} from "./t3team-cloudQueuedSendProviderReadyStore";

function toolAuthPhaseFor(
  states: ReturnType<typeof useToolAuthStates>,
  tool: "claude" | "codex" | "gh" | undefined,
) {
  return tool === undefined ? undefined : states.get(tool);
}

export function CloudQueuedSendProviderEnsure(props: {
  readonly queued: CloudQueuedSend;
  readonly environmentId: EnvironmentId | null;
  readonly projectReady: boolean;
}) {
  const { queued, environmentId, projectReady } = props;
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    environmentId === null ? null : (providersByEnvironment.get(environmentId) ?? null);
  const states = useToolAuthStates(environmentId);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the gate into the ready store the flusher reads
  useEffect(() => {
    if (!projectReady || environmentId === null) {
      clearCloudQueuedSendProviderReady(queued.messageId);
      return;
    }
    const instanceId = queued.modelSelection.instanceId;
    const provider = providers?.find((entry) => entry.instanceId === instanceId);
    const previewTool =
      provider?.driver === "claudeAgent"
        ? "claude"
        : provider?.driver === "codex"
          ? "codex"
          : undefined;
    const toolAuth = toolAuthPhaseFor(states, previewTool);
    setCloudQueuedSendProviderReady(
      queued.messageId,
      resolveCloudQueuedSendProviderGate({
        instanceId,
        providers,
        toolAuthPhase: toolAuth?.phase,
        toolAuthMessage: toolAuth?.message,
        toolAuthTool: previewTool,
      }),
    );
  }, [
    environmentId,
    projectReady,
    providers,
    queued.messageId,
    queued.modelSelection.instanceId,
    states,
  ]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the ready-store entry when this queued message unmounts
  useEffect(
    () => () => {
      clearCloudQueuedSendProviderReady(queued.messageId);
    },
    [queued.messageId],
  );

  return null;
}
