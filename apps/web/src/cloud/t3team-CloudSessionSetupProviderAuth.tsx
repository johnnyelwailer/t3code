/**
 * Inline Claude/Codex ToolAuth card on the setup card's Provider step. Nothing starts on its own:
 * the user clicks Install and connect here, and the card then shows the live phases (installing,
 * device code, …) so sign-in finishes without leaving the thread.
 */
import { ProviderDriverKind, type EnvironmentId, type ToolAuthToolId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { ToolAuthCard } from "~/components/settings/t3team-ToolAuthCard";
import {
  toolAuthMetaForTool,
  toolAuthToolForDriverKind,
} from "~/components/settings/t3team-toolAuthTools";
import { ToolAuthUnavailableNotice } from "~/components/settings/t3team-ToolAuthUnavailableNotice";
import { useEnvironmentProviders } from "~/state/environments";
import { useToolAuthActions, useToolAuthStates } from "~/state/t3team-toolauth";
import { useToolAuthEnvironmentAvailability } from "~/t3team/t3team-useToolAuthEnvironmentFlag";

import {
  useSignInDescriptionForEnvironment,
  useToolAuthMachineLabel,
} from "./t3team-cloudMachineSignIn";
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
    gate?.kind === "needsInstall" || gate?.kind === "needsAuth" || gate?.kind === "failed"
      ? gate.tool
      : undefined;
  const tool = toolFromGate ?? toolFromProvider;
  if (gate?.kind === "ready" || tool === undefined) return null;
  // A sign-in failure belongs on the tool's own card, which maps the reason to plain words and
  // offers Retry. Only a failure with no tool behind it (a provider disabled for this project)
  // has nothing to retry and stays a sentence.
  if (gate?.kind === "failed" && gate.tool === undefined) {
    return (
      <p
        data-cloud-setup-provider-auth="failed"
        className="mt-3.5 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground"
      >
        {gate.message}
      </p>
    );
  }
  return (
    <ProviderAuthCard
      environmentId={environmentId}
      instanceId={instanceId}
      tool={tool}
      needsInstall={gate?.kind === "needsInstall" || provider?.installed === false}
    />
  );
}

function ProviderAuthCard(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: string;
  readonly tool: ToolAuthToolId;
  /** One click installs and signs in; a plain Connect cannot succeed against a missing binary. */
  readonly needsInstall: boolean;
}) {
  const { environmentId, instanceId, tool, needsInstall } = props;
  const meta = toolAuthMetaForTool(tool);
  const states = useToolAuthStates(environmentId);
  const { onConnect, onInstall, onSubmitCode, onCancel } = useToolAuthActions(meta, environmentId, {
    instanceId,
  });
  const signInDescription = useSignInDescriptionForEnvironment(environmentId);
  const machineLabel = useToolAuthMachineLabel(environmentId);
  const availability = useToolAuthEnvironmentAvailability(environmentId);
  return (
    <div
      data-cloud-setup-provider-auth={tool}
      className="mt-3.5 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm/4"
    >
      {availability === "disabled" ? (
        <ToolAuthUnavailableNotice meta={meta} machineLabel={machineLabel} />
      ) : (
        <ToolAuthCard
          meta={meta}
          state={states.get(tool)}
          signInDescription={signInDescription}
          machineLabel={machineLabel}
          onConnect={onConnect}
          onInstall={needsInstall ? onInstall : undefined}
          onSubmitCode={onSubmitCode}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
