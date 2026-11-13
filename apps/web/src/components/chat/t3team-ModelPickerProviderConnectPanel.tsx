"use client";

import type { EnvironmentId, ToolAuthToolId } from "@t3tools/contracts";

import {
  useSignInDescriptionForEnvironment,
  useToolAuthMachineLabel,
} from "../../cloud/t3team-cloudMachineSignIn";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useToolAuthActions, useToolAuthStates } from "../../state/t3team-toolauth";
import { resolveToolAuthEnvironmentId } from "../../state/t3team-toolauthActions";
import { useToolAuthEnvironmentAvailability } from "../../t3team/t3team-useToolAuthEnvironmentFlag";
import { ToolAuthCard } from "../settings/t3team-ToolAuthCard";
import { ToolAuthUnavailableNotice } from "../settings/t3team-ToolAuthUnavailableNotice";
import { toolAuthMetaForTool } from "../settings/t3team-toolAuthTools";
import { ModelPickerSignInRefreshNotice } from "./t3team-ModelPickerSignInRefreshNotice";
import { reconcileToolAuthWithProvider } from "./t3team-reconcileToolAuthWithProvider";
import { useProviderRefreshAfterSignIn } from "./t3team-useProviderRefreshAfterSignIn";

export interface ModelPickerProviderConnectPanelProps {
  /** The instance the user selected in the picker sidebar. */
  readonly entry: ProviderInstanceEntry;
  /** `entry.driverKind` mapped through `toolAuthToolForDriverKind` — the caller already checked this exists. */
  readonly tool: ToolAuthToolId;
  readonly readiness: "needsAuth" | "needsInstall";
  /**
   * The environment the picker's instances come from (the thread's). The tool's sign-in state and
   * every connect/install act on that machine, not on the primary: a thread on a cloud session must
   * not show (or change) this computer's CLI login. Defaults to the primary environment.
   */
  readonly environmentId?: EnvironmentId | null | undefined;
}

/**
 * Renders in place of the model list (`ModelPickerContent.tsx`, immediately
 * before the `ComboboxListVirtualized` block) when the selected instance is
 * installed-but-unauthenticated or not installed at all — the moment the
 * user actually hits the problem, rather than a settings page they may never
 * visit. `ConnectedToolsSettings` remains the secondary surface for the same
 * flow; both share `ToolAuthCard` and the `useToolAuthActions`/
 * `useToolAuthStates` hooks so connecting behaves identically either way.
 *
 * Sized for the picker's list area (a ~350px-wide popover column), not a
 * settings pane — narrower card, no outer settings-list chrome.
 */
export function ModelPickerProviderConnectPanel({
  entry,
  tool,
  readiness,
  environmentId: threadEnvironmentId,
}: ModelPickerProviderConnectPanelProps) {
  const meta = toolAuthMetaForTool(tool);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = resolveToolAuthEnvironmentId(threadEnvironmentId, primaryEnvironmentId);
  const states = useToolAuthStates(environmentId);
  const { onConnect, onInstall, onSubmitCode, onCancel } = useToolAuthActions(meta, environmentId, {
    instanceId: entry.instanceId,
  });
  const signInDescription = useSignInDescriptionForEnvironment(environmentId);
  const machineLabel = useToolAuthMachineLabel(environmentId);
  const availability = useToolAuthEnvironmentAvailability(environmentId);
  // Same source as Settings: if the provider probe says unauthenticated, do not keep a stale
  // "connected" tool-auth phase on the card (that is what made the menu say "Signed in").
  const toolAuthState = reconcileToolAuthWithProvider(
    states.get(meta.tool),
    entry.snapshot.auth.status,
  );
  // The re-check fires on the raw stream, not the reconciled card state: right after a sign-in the
  // stream is `connected` while the provider snapshot still holds the pre-login probe, so the
  // reconciled card reads `expired` until this very re-check answers with the new probe.
  const refreshAfterSignIn = useProviderRefreshAfterSignIn({
    environmentId,
    instanceId: entry.instanceId,
    signedIn: states.get(meta.tool)?.phase === "connected",
  });
  const missingEnvironment = environmentId === null && readiness === "needsInstall";

  // Top-aligned, not centred: the card is short and the picker's list area is
  // tall, so centring left a big dead gap above it that read as a broken panel.
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
      <div className="w-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm/4">
        {/*
          One card for the whole journey. When the CLI is missing we pass
          `onInstall`, which makes the single action install AND sign in — the
          server chains install → re-probe → login and streams every phase
          (`installing`, then `awaiting-open`/`awaiting-code`, …) back through
          the same `useToolAuthStates` subscription. So there is no separate
          "installed, now connect" step to render, and no second button.
        */}
        {availability === "disabled" ? (
          <ToolAuthUnavailableNotice meta={meta} machineLabel={machineLabel} />
        ) : (
          <ToolAuthCard
            meta={meta}
            state={toolAuthState}
            signInDescription={signInDescription}
            machineLabel={machineLabel}
            failure={missingEnvironment ? "noEnvironment" : undefined}
            onConnect={onConnect}
            onInstall={readiness === "needsInstall" ? onInstall : undefined}
            onSubmitCode={onSubmitCode}
            onCancel={onCancel}
          />
        )}
        <ModelPickerSignInRefreshNotice
          displayName={entry.displayName}
          status={refreshAfterSignIn.status}
          error={refreshAfterSignIn.error}
          onRetry={refreshAfterSignIn.retry}
          onSignIn={onConnect}
        />
      </div>
    </div>
  );
}
