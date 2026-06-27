import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MODEL, DEFAULT_RUNTIME_MODE, ProviderInstanceId } from "@t3tools/contracts";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";

import { getProviderInteractionModeToggle } from "~/providerModels";
import {
  deriveProviderInstanceEntries,
  applyProviderInstanceSettings,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "~/providerInstances";
import { usePrimarySettings } from "~/hooks/useSettings";
import { DEFAULT_T3WORK_THREAD_TOOL_IDS } from "~/t3work/t3work-threadToolContext";
import { runtimeModeConfig } from "~/t3work/t3work-ticketKickoffRuntimeConfig";
import type { T3workThreadToolId } from "~/t3work/t3work-types";

export type T3workKickoffLaunchConfig = {
  readonly selection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly selectedToolIds: ReadonlyArray<T3workThreadToolId>;
};

export function createDefaultT3workKickoffLaunchConfig(): T3workKickoffLaunchConfig {
  return {
    selection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: DEFAULT_MODEL,
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: "default",
    selectedToolIds: DEFAULT_T3WORK_THREAD_TOOL_IDS,
  };
}

export function getT3workKickoffProviderBlocker(input: {
  readonly isConnected: boolean;
  readonly providerInstanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  readonly selectedProviderEntry: ProviderInstanceEntry | undefined;
}): string | null {
  if (!input.isConnected) return "Server is disconnected.";
  if (input.providerInstanceEntries.length === 0) {
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

export function useT3workKickoffComposerState(providers: ReadonlyArray<ServerProvider>) {
  const providerSettings = usePrimarySettings((settings) => ({
    providerInstances: settings.providerInstances,
    providers: settings.providers,
  }));
  const enabledAvailableProviders = useMemo(
    () =>
      providers.filter((provider) => provider.enabled && provider.availability !== "unavailable"),
    [providers],
  );
  const providerInstanceEntries = useMemo<ReadonlyArray<ProviderInstanceEntry>>(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), providerSettings),
      ),
    [providerSettings, providers],
  );
  const modelOptionsByInstance = useMemo(() => {
    const options = new Map();
    for (const entry of providerInstanceEntries) {
      options.set(
        entry.instanceId,
        entry.models.map((model) => ({
          slug: model.slug,
          name: model.name,
          isCustom: model.isCustom,
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
        })),
      );
    }
    return options;
  }, [providerInstanceEntries]);
  const [selectedInstanceId, setSelectedInstanceId] = useState(ProviderInstanceId.make("codex"));
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(DEFAULT_RUNTIME_MODE);
  const [interactionMode, setInteractionMode] = useState<ProviderInteractionMode>("default");

  useEffect(() => {
    if (
      providerInstanceEntries.length > 0 &&
      !providerInstanceEntries.some((entry) => entry.instanceId === selectedInstanceId)
    ) {
      setSelectedInstanceId(providerInstanceEntries[0]!.instanceId);
    }
  }, [providerInstanceEntries, selectedInstanceId]);

  const selectedProviderEntry = useMemo(
    () => providerInstanceEntries.find((entry) => entry.instanceId === selectedInstanceId),
    [providerInstanceEntries, selectedInstanceId],
  );
  const selectedProvider = selectedProviderEntry?.snapshot;
  const selectedProviderModels = selectedProviderEntry?.models ?? [];

  useEffect(() => {
    if (selectedProviderModels.length === 0) {
      setSelectedModel(DEFAULT_MODEL);
      return;
    }
    if (!selectedProviderModels.some((model) => model.slug === selectedModel)) {
      setSelectedModel(selectedProviderModels[0]!.slug);
    }
  }, [selectedModel, selectedProviderModels]);

  const showInteractionModeToggle = selectedProviderEntry
    ? getProviderInteractionModeToggle(enabledAvailableProviders, selectedProviderEntry.driverKind)
    : true;
  const selectedToolIds: ReadonlyArray<T3workThreadToolId> = DEFAULT_T3WORK_THREAD_TOOL_IDS;
  const launchConfig = useMemo<T3workKickoffLaunchConfig>(
    () => ({
      selection:
        selectedProviderEntry !== undefined
          ? {
              instanceId: selectedProviderEntry.instanceId,
              model: selectedModel,
            }
          : createDefaultT3workKickoffLaunchConfig().selection,
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
    providerInstanceEntries,
    runtimeMode,
    runtimeOption: runtimeModeConfig[runtimeMode],
    selectedInstanceId,
    selectedModel,
    selectedProvider,
    selectedProviderEntry,
    showInteractionModeToggle,
    setInteractionMode,
    setRuntimeMode,
    setSelectedInstanceId,
    setSelectedModel,
  };
}
