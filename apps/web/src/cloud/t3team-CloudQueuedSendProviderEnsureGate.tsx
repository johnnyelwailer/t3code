/**
 * Once project checkout is done, auto-starts install or sign-in for the composer-selected
 * provider and publishes ready/failed into the provider-ready store the flusher waits on.
 * Failures stay on the setup card (gate.failed); this path never toasts.
 */
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useEnvironmentProviders } from "~/state/environments";
import { toolAuthEnvironment, useToolAuthStates } from "~/state/t3team-toolauth";
import { useAtomCommand } from "~/state/use-atom-command";

import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { ensureActionForProviderGate } from "./t3team-cloudQueuedSendProviderEnsure";
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
  const install = useAtomCommand(toolAuthEnvironment.install, { reportFailure: false });
  const start = useAtomCommand(toolAuthEnvironment.start, { reportFailure: false });
  const startedRef = useRef<string | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes gate into the ready store and auto-starts ToolAuth install/connect for the flusher
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
    const gate = resolveCloudQueuedSendProviderGate({
      instanceId,
      providers,
      toolAuthPhase: toolAuth?.phase,
      toolAuthMessage: toolAuth?.message,
    });
    setCloudQueuedSendProviderReady(queued.messageId, gate);

    const action = ensureActionForProviderGate(gate);
    if (action === null || (gate.kind !== "needsInstall" && gate.kind !== "needsAuth")) return;
    const tool = gate.tool;
    const key = `${queued.messageId}:${action}:${tool}`;
    if (startedRef.current === key) return;
    startedRef.current = key;
    void (async () => {
      const result =
        action === "install"
          ? await install({ environmentId, input: { tool } })
          : await start({ environmentId, input: { tool } });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        setCloudQueuedSendProviderReady(queued.messageId, {
          kind: "failed",
          message: "Could not start provider setup. Retry from the setup card.",
        });
      }
    })();
  }, [
    environmentId,
    install,
    projectReady,
    providers,
    queued.messageId,
    queued.modelSelection.instanceId,
    start,
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
