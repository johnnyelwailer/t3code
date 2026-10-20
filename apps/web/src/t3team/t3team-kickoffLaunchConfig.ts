import { useMemo, useState } from "react";
import { DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";
import type {
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";

import { getProviderInteractionModeToggle } from "~/t3team/t3team-providerModels";
import type { ProviderInstanceEntry } from "~/providerInstances";
import { usePrimarySettings } from "~/hooks/useSettings";
import { DEFAULT_T3TEAM_THREAD_TOOL_IDS } from "~/t3team/t3team-threadToolContext";
import { useT3TeamKickoffProviderSelection } from "~/t3team/t3team-kickoffProviderSelection";
import { runtimeModeConfig } from "~/t3team/t3team-ticketKickoffRuntimeConfig";
import type { T3TeamThreadToolId } from "~/t3team/t3team-types";
import { getConfiguredDefaultModelSelection } from "~/t3team-configuredDefaultModelSelection";

type ProviderSettingsSnapshot = {
  readonly providerInstances: Record<string, { readonly enabled?: boolean } | undefined>;
};

export type T3TeamKickoffLaunchConfig = {
  readonly selection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly selectedToolIds: ReadonlyArray<T3TeamThreadToolId>;
};

export function createDefaultT3TeamKickoffLaunchConfig(): T3TeamKickoffLaunchConfig {
  return {
    selection: getConfiguredDefaultModelSelection(),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: "default",
    selectedToolIds: DEFAULT_T3TEAM_THREAD_TOOL_IDS,
  };
}

export function getT3TeamKickoffProviderBlocker(input: {
  readonly isConnected: boolean;
  /** When set, "connecting" is not reported as disconnected (matches the thread composer). */
  readonly connectionStatus?: "disconnected" | "connecting" | "connected" | "error";
  readonly hasConfiguredProviders?: boolean;
  readonly providerInstanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  readonly selectedProviderEntry: ProviderInstanceEntry | undefined;
}): string | null {
  if (!input.isConnected) {
    if (input.connectionStatus === "connecting") return "Connecting to the server…";
    return "Server is disconnected.";
  }
  if (input.providerInstanceEntries.length === 0) {
    if (input.hasConfiguredProviders) {
      return "Loading provider status...";
    }
    return "No providers are configured. Add or enable a provider in Settings.";
  }
  if (!input.selectedProviderEntry) return "Select a provider to start a chat.";
  if (!input.selectedProviderEntry.enabled) {
    return "Selected provider is disabled. Enable it in Settings.";
  }
  if (!input.selectedProviderEntry.isAvailable || input.selectedProviderEntry.status !== "ready") {
    return "Selected provider is not ready. Check provider settings.";
  }
  return null;
}

export function hasConfiguredProviderSettings(settings: ProviderSettingsSnapshot): boolean {
  for (const instance of Object.values(settings.providerInstances)) {
    if (instance && (instance.enabled ?? true)) return true;
  }
  return false;
}

export function useT3TeamKickoffComposerState(
  providers: ReadonlyArray<ServerProvider>,
  projectId: ProjectId | null,
) {
  const settings = usePrimarySettings();
  const hasConfiguredProviders = useMemo(() => hasConfiguredProviderSettings(settings), [settings]);
  const enabledAvailableProviders = useMemo(
    () =>
      providers.filter((provider) => provider.enabled && provider.availability !== "unavailable"),
    [providers],
  );
  const {
    providerInstanceEntries,
    modelOptionsByInstance,
    selectedProviderEntry,
    selectedInstanceId,
    selectedModel,
    selectModel,
  } = useT3TeamKickoffProviderSelection({ providers, projectId, settings });
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(DEFAULT_RUNTIME_MODE);
  const [interactionMode, setInteractionMode] = useState<ProviderInteractionMode>("default");
  const selectedProvider = selectedProviderEntry?.snapshot;

  const showInteractionModeToggle = selectedProviderEntry
    ? getProviderInteractionModeToggle(enabledAvailableProviders, selectedProviderEntry.driverKind)
    : true;
  const selectedToolIds: ReadonlyArray<T3TeamThreadToolId> = DEFAULT_T3TEAM_THREAD_TOOL_IDS;
  const launchConfig = useMemo<T3TeamKickoffLaunchConfig>(
    () => ({
      selection:
        selectedProviderEntry !== undefined
          ? {
              instanceId: selectedProviderEntry.instanceId,
              model: selectedModel,
            }
          : createDefaultT3TeamKickoffLaunchConfig().selection,
      runtimeMode,
      interactionMode,
      selectedToolIds,
    }),
    [interactionMode, runtimeMode, selectedModel, selectedProviderEntry, selectedToolIds],
  );

  return {
    interactionMode,
    launchConfig,
    modelOptionsByInstance,
    hasConfiguredProviders,
    providerInstanceEntries,
    runtimeMode,
    runtimeOption: runtimeModeConfig[runtimeMode],
    selectedInstanceId,
    selectedModel,
    selectedProvider,
    selectedProviderEntry,
    showInteractionModeToggle,
    selectModel,
    setInteractionMode,
    setRuntimeMode,
  };
}
