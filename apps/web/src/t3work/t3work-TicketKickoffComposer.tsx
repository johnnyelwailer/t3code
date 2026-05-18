import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL, DEFAULT_RUNTIME_MODE, ProviderInstanceId } from "@t3tools/contracts";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";
import {
  ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditor";
import { getProviderInteractionModeToggle } from "~/providerModels";
import { deriveProviderInstanceEntries, sortProviderInstanceEntries } from "~/providerInstances";
import { cn } from "~/lib/utils";
import { TicketKickoffComposerControls } from "~/t3work/t3work-TicketKickoffComposerControls";
import { runtimeModeConfig, runtimeModeOptions } from "~/t3work/t3work-ticketKickoffRuntimeConfig";

export function TicketKickoffComposer({
  prefillText,
  providers,
  isConnected,
  onSubmit,
}: {
  prefillText?: string;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onSubmit: (
    text: string,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
  ) => void;
}) {
  const availableProviders = useMemo(
    () =>
      providers.filter((provider) => provider.enabled && provider.availability !== "unavailable"),
    [providers],
  );
  const providerInstanceEntries = useMemo(
    () => sortProviderInstanceEntries(deriveProviderInstanceEntries(availableProviders)),
    [availableProviders],
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

  const [text, setText] = useState(prefillText ?? "");
  const [cursor, setCursor] = useState((prefillText ?? "").length);
  const [selectedInstanceId, setSelectedInstanceId] = useState(ProviderInstanceId.make("codex"));
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(DEFAULT_RUNTIME_MODE);
  const [interactionMode, setInteractionMode] = useState<ProviderInteractionMode>("default");
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);

  useEffect(() => {
    if (prefillText !== undefined) {
      setText(prefillText);
      setCursor(prefillText.length);
    }
  }, [prefillText]);
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
    ? getProviderInteractionModeToggle(availableProviders, selectedProviderEntry.driverKind)
    : true;
  const handleSubmit = useCallback(() => {
    const next = text.trim();
    if (!next || !isConnected || !selectedProviderEntry) return;
    onSubmit(
      next,
      { instanceId: selectedProviderEntry.instanceId, model: selectedModel },
      runtimeMode,
      interactionMode,
    );
    setText("");
    setCursor(0);
  }, [
    interactionMode,
    isConnected,
    onSubmit,
    runtimeMode,
    selectedModel,
    selectedProviderEntry,
    text,
  ]);

  const runtimeOption = runtimeModeConfig[runtimeMode];
  const canSend = Boolean(text.trim()) && isConnected && Boolean(selectedProviderEntry);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className="mx-auto w-full min-w-0 max-w-208"
      data-chat-composer-form="true"
    >
      <div className="group rounded-[22px] p-px transition-colors duration-200">
        <div
          className={cn(
            "rounded-[20px] border bg-card transition-colors duration-200 has-focus-visible:border-ring/45",
            "border-border",
            !isConnected ? "opacity-75" : null,
          )}
        >
          <div className="relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4">
            <ComposerPromptEditor
              editorRef={editorRef}
              value={text}
              cursor={cursor}
              terminalContexts={[]}
              skills={selectedProvider?.skills ?? []}
              onRemoveTerminalContext={() => {}}
              onChange={(nextValue, nextCursor) => {
                setText(nextValue);
                setCursor(nextCursor);
              }}
              onPaste={() => {}}
              placeholder={
                isConnected
                  ? "Ask anything, @tag files/folders, $use skills, or / for commands"
                  : "Server is disconnected"
              }
              disabled={!isConnected}
            />
          </div>
          <TicketKickoffComposerControls
            selectedInstanceId={selectedInstanceId}
            selectedModel={selectedModel}
            runtimeMode={runtimeMode}
            interactionMode={interactionMode}
            runtimeOption={runtimeOption}
            runtimeModeOptions={runtimeModeOptions}
            runtimeModeConfig={runtimeModeConfig}
            providerInstanceEntries={providerInstanceEntries}
            modelOptionsByInstance={modelOptionsByInstance}
            selectedProviderEntry={selectedProviderEntry}
            showInteractionModeToggle={showInteractionModeToggle}
            isConnected={isConnected}
            text={text}
            canSend={canSend}
            setSelectedInstanceId={setSelectedInstanceId}
            setSelectedModel={setSelectedModel}
            setInteractionMode={setInteractionMode}
            setRuntimeMode={setRuntimeMode}
          />
        </div>
      </div>
    </form>
  );
}
