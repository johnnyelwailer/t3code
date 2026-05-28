import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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
import { cn } from "~/lib/utils";
import { useAddToChatComposerDropTarget } from "~/t3work/hooks/t3work-useAddToChatComposerDropTarget";
import {
  createDefaultT3workKickoffLaunchConfig,
  useT3workKickoffComposerState,
  type T3workKickoffLaunchConfig,
} from "~/t3work/t3work-kickoffLaunchConfig";
import { TicketKickoffComposerControls } from "~/t3work/t3work-TicketKickoffComposerControls";
import { TicketKickoffComposerSelectedRecipe } from "~/t3work/t3work-TicketKickoffComposerSelectedRecipe";
import {
  getT3workSelectedRecipeComposerPlaceholder,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { runtimeModeConfig, runtimeModeOptions } from "~/t3work/t3work-ticketKickoffRuntimeConfig";
import type { T3workThreadToolId } from "~/t3work/t3work-types";

type TicketKickoffComposerProps = {
  prefillText?: string;
  selectedRecipe?: T3workSelectedRecipeQuickStart;
  onClearSelectedRecipe?: () => void;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onSubmit: (
    text: string,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
    selectedToolIds: ReadonlyArray<T3workThreadToolId>,
  ) => void;
};

export type T3workKickoffComposerHandle = {
  getLaunchConfig: () => T3workKickoffLaunchConfig;
};

export { createDefaultT3workKickoffLaunchConfig };
export type { T3workKickoffLaunchConfig };

export const TicketKickoffComposer = forwardRef<
  T3workKickoffComposerHandle,
  TicketKickoffComposerProps
>(
  (
    { prefillText, selectedRecipe, onClearSelectedRecipe, providers, isConnected, onSubmit },
    ref,
  ) => {
    const {
      interactionMode,
      launchConfig,
      modelOptionsByInstance,
      providerInstanceEntries,
      runtimeMode,
      runtimeOption,
      selectedInstanceId,
      selectedModel,
      selectedProvider,
      selectedProviderEntry,
      showInteractionModeToggle,
      setInteractionMode,
      setRuntimeMode,
      setSelectedInstanceId,
      setSelectedModel,
    } = useT3workKickoffComposerState(providers);
    const [text, setText] = useState(prefillText ?? "");
    const [cursor, setCursor] = useState((prefillText ?? "").length);
    const editorRef = useRef<ComposerPromptEditorHandle | null>(null);

    useEffect(() => {
      if (prefillText !== undefined) {
        setText(prefillText);
        setCursor(prefillText.length);
      }
    }, [prefillText]);

    useEffect(() => {
      if (selectedRecipe) {
        editorRef.current?.focusAtEnd();
      }
    }, [selectedRecipe]);

    const composerDropTarget = useAddToChatComposerDropTarget();

    useImperativeHandle(
      ref,
      () => ({
        getLaunchConfig: () => launchConfig,
      }),
      [launchConfig],
    );

    const handleSubmit = useCallback(() => {
      const next = text.trim();
      if ((!next && !selectedRecipe) || !isConnected) return;
      onSubmit(
        next,
        launchConfig.selection,
        launchConfig.runtimeMode,
        launchConfig.interactionMode,
        launchConfig.selectedToolIds,
      );
      setText("");
      setCursor(0);
    }, [isConnected, launchConfig, onSubmit, selectedRecipe, text]);

    const canSend =
      (Boolean(text.trim()) || Boolean(selectedRecipe)) &&
      isConnected &&
      Boolean(selectedProviderEntry);

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
              "relative rounded-[20px] border bg-card transition-colors duration-200 has-focus-visible:border-ring/45",
              "border-border",
              !isConnected ? "opacity-75" : null,
            )}
            {...composerDropTarget.composerContainerProps}
          >
            {composerDropTarget.composerContainerOverlay}
            {selectedRecipe ? (
              <TicketKickoffComposerSelectedRecipe
                selectedRecipe={selectedRecipe}
                {...(onClearSelectedRecipe ? { onClearSelectedRecipe } : {})}
              />
            ) : null}
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
                    ? selectedRecipe
                      ? getT3workSelectedRecipeComposerPlaceholder(selectedRecipe)
                      : "Ask anything, @tag files/folders, $use skills, or / for commands"
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
  },
);

TicketKickoffComposer.displayName = "TicketKickoffComposer";
