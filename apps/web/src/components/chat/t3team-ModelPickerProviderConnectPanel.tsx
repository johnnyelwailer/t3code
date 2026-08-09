"use client";

import type { ToolAuthToolId } from "@t3tools/contracts";

import type { ProviderInstanceEntry } from "../../providerInstances";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useToolAuthActions, useToolAuthStates } from "../../state/t3team-toolauth";
import { ToolAuthCard } from "../settings/t3team-ToolAuthCard";
import { toolAuthMetaForTool } from "../settings/t3team-toolAuthTools";

export interface ModelPickerProviderConnectPanelProps {
  /** The instance the user selected in the picker sidebar. */
  readonly entry: ProviderInstanceEntry;
  /** `entry.driverKind` mapped through `toolAuthToolForDriverKind` — the caller already checked this exists. */
  readonly tool: ToolAuthToolId;
  readonly readiness: "needsAuth" | "needsInstall";
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
  tool,
  readiness,
}: ModelPickerProviderConnectPanelProps) {
  const meta = toolAuthMetaForTool(tool);
  const environmentId = usePrimaryEnvironmentId();
  const states = useToolAuthStates(environmentId);
  const { onConnect, onInstall, onSubmitCode, onCancel } = useToolAuthActions(meta);

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
        <ToolAuthCard
          meta={meta}
          state={states.get(meta.tool)}
          onConnect={onConnect}
          onInstall={readiness === "needsInstall" ? onInstall : undefined}
          onSubmitCode={onSubmitCode}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
