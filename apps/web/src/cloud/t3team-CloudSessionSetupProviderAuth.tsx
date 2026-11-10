/**
 * Inline Claude/Codex ToolAuth card on the setup card's Provider step. The flusher's Ensure
 * auto-starts install/connect; this surface shows the live phases (installing, device code, …)
 * so the user can finish sign-in without leaving the thread.
 */
import { ProviderDriverKind, type EnvironmentId, type ToolAuthToolId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { ToolAuthCard } from "~/components/settings/t3team-ToolAuthCard";
import {
  toolAuthMetaForTool,
  toolAuthToolForDriverKind,
} from "~/components/settings/t3team-toolAuthTools";
import { useEnvironmentProviders } from "~/state/environments";
import { useToolAuthActions, useToolAuthStates } from "~/state/t3team-toolauth";

import { useSignInDescriptionForEnvironment } from "./t3team-cloudMachineSignIn";
import type { CloudQueuedSendProviderGate } from "./t3team-cloudQueuedSendProviderGate";
import {
  getCloudQueuedSendProviderGate,
  subscribeCloudQueuedSendProviderReady,
} from "./t3team-cloudQueuedSendProviderReadyStore";

export function CloudSessionSetupProviderAuth(props: {
  readonly messageId: string;
  readonly environmentId: EnvironmentId;
  readonly instanceId: string;
}) {
  const { messageId, environmentId, instanceId } = props;
  const gate = useSyncExternalStore(
    subscribeCloudQueuedSendProviderReady,
    () => getCloudQueuedSendProviderGate(messageId),
    () => null,
  );
  const providers = useEnvironmentProviders().get(environmentId) ?? [];
  const provider = providers.find((entry) => entry.instanceId === instanceId);
  const toolFromProvider =
    provider === undefined
      ? undefined
      : toolAuthToolForDriverKind(ProviderDriverKind.make(provider.driver));
  const toolFromGate =
    gate?.kind === "needsInstall" || gate?.kind === "needsAuth" ? gate.tool : undefined;
  const tool = toolFromGate ?? toolFromProvider;
  if (gate?.kind === "ready" || tool === undefined) return null;
  if (gate?.kind === "failed") {
    return (
      <p
        data-cloud-setup-provider-auth="failed"
        className="mt-3.5 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground"
      >
        {gate.message}
      </p>
    );
  }
  return <ProviderAuthCard environmentId={environmentId} tool={tool} gate={gate} />;
}

function ProviderAuthCard(props: {
  readonly environmentId: EnvironmentId;
  readonly tool: ToolAuthToolId;
  readonly gate: CloudQueuedSendProviderGate | null;
}) {
  const { environmentId, tool, gate } = props;
  const meta = toolAuthMetaForTool(tool);
  const states = useToolAuthStates(environmentId);
  const { onConnect, onInstall, onSubmitCode, onCancel } = useToolAuthActions(meta, environmentId);
  const signInDescription = useSignInDescriptionForEnvironment(environmentId);
  return (
    <div
      data-cloud-setup-provider-auth={tool}
      className="mt-3.5 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm/4"
    >
      <ToolAuthCard
        meta={meta}
        state={states.get(tool)}
        signInDescription={signInDescription}
        onConnect={onConnect}
        onInstall={gate?.kind === "needsInstall" ? onInstall : undefined}
        onSubmitCode={onSubmitCode}
        onCancel={onCancel}
      />
    </div>
  );
}
