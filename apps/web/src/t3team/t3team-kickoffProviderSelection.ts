import { useCallback, useMemo, useState } from "react";
import type {
  ModelSelection,
  ProjectId,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import { resolveComposerProviderSelection } from "~/components/ChatView.logic";
import {
  getAppModelOptionsForInstance,
  resolveAppModelSelectionForInstance,
  type AppModelOption,
} from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  NO_PROVIDER_MODEL_SELECTION,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "~/providerInstances";

function resolveSelectedModel(input: {
  entry: ProviderInstanceEntry | undefined;
  picked: ModelSelection | null;
  projectDefault: ModelSelection | null;
  settings: UnifiedSettings;
  providers: ReadonlyArray<ServerProvider>;
}): string {
  const { entry, picked, projectDefault } = input;
  if (entry === undefined) return picked?.model ?? projectDefault?.model ?? "";
  if (picked?.instanceId === entry.instanceId) return picked.model;
  const candidate = projectDefault?.instanceId === entry.instanceId ? projectDefault.model : null;
  return (
    resolveAppModelSelectionForInstance(
      entry.instanceId,
      input.settings,
      input.providers,
      candidate,
    ) ?? ""
  );
}

/**
 * The provider instance and model a kickoff composer sends with, resolved the way the thread
 * composer resolves a new thread in the same project: the user's pick, then the project's default
 * model selection, then a ready instance. Entries fold in the project's instance enablement and
 * model options carry each instance's custom models and preferences, as in the thread composer.
 */
export function useT3TeamKickoffProviderSelection(input: {
  providers: ReadonlyArray<ServerProvider>;
  projectId: ProjectId | null;
  settings: UnifiedSettings;
}) {
  const { providers, projectId, settings } = input;
  const providerInstanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(
          deriveProviderInstanceEntries(providers),
          settings,
          projectId,
        ),
      ),
    [projectId, providers, settings],
  );
  const projectDefault = useMemo(
    () => resolveProjectSettings(settings, projectId).settings.defaultModelSelection ?? null,
    [projectId, settings],
  );
  const [picked, setPicked] = useState<ModelSelection | null>(null);
  const selectedProviderEntry = useMemo(
    () =>
      resolveComposerProviderSelection({
        entries: providerInstanceEntries,
        candidateInstanceIds: [picked?.instanceId, projectDefault?.instanceId],
        lockedProvider: null,
        lockedInstanceId: null,
      }).selectedProviderEntry,
    [picked?.instanceId, projectDefault?.instanceId, providerInstanceEntries],
  );
  const selectedInstanceId =
    selectedProviderEntry?.instanceId ?? NO_PROVIDER_MODEL_SELECTION.instanceId;
  const selectedModel = useMemo(
    () =>
      resolveSelectedModel({
        entry: selectedProviderEntry,
        picked,
        projectDefault,
        settings,
        providers,
      }),
    [picked, projectDefault, providers, selectedProviderEntry, settings],
  );
  const modelOptionsByInstance = useMemo(() => {
    const options = new Map<ProviderInstanceId, ReadonlyArray<AppModelOption>>();
    for (const entry of providerInstanceEntries) {
      const selected = entry.instanceId === selectedInstanceId ? selectedModel : null;
      options.set(entry.instanceId, getAppModelOptionsForInstance(settings, entry, selected));
    }
    return options;
  }, [providerInstanceEntries, selectedInstanceId, selectedModel, settings]);
  const selectModel = useCallback((instanceId: ProviderInstanceId, model: string) => {
    setPicked({ instanceId, model });
  }, []);

  return {
    providerInstanceEntries,
    modelOptionsByInstance,
    selectedProviderEntry,
    selectedInstanceId,
    selectedModel,
    selectModel,
  };
}
