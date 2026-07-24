import { forwardRef, useCallback, useImperativeHandle } from "react";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { KickoffComposerEditor } from "~/t3work/composer/t3work-KickoffComposerEditor";
import { useT3workKickoffComposerMenu } from "~/t3work/composer/t3work-useKickoffComposerMenu";
import { useT3workKickoffComposerText } from "~/t3work/composer/t3work-useKickoffComposerText";
import { useAddToChatComposerDropTarget } from "~/t3work/hooks/t3work-useAddToChatComposerDropTarget";
import {
  createDefaultT3workKickoffLaunchConfig,
  getT3workKickoffProviderBlocker,
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
  /** Workspace root used as the `@` path-search cwd. */
  workspaceRoot?: string;
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
    {
      prefillText,
      selectedRecipe,
      onClearSelectedRecipe,
      providers,
      isConnected,
      workspaceRoot,
      onSubmit,
    },
    ref,
  ) => {
    const {
      interactionMode,
      launchConfig,
      modelOptionsByInstance,
      hasConfiguredProviders,
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
    const { text, cursor, editorRef, setText, setCursor } = useT3workKickoffComposerText({
      prefillText,
      hasSelectedRecipe: Boolean(selectedRecipe),
    });

    const commandMenu = useT3workKickoffComposerMenu({
      selectedProvider,
      workspaceRoot: workspaceRoot ?? null,
      editorRef,
      text,
      cursor,
      setText,
      setCursor,
      setInteractionMode,
    });

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
      commandMenu.resetTrigger();
    }, [commandMenu, isConnected, launchConfig, onSubmit, selectedRecipe, text]);

    const providerStatusMessage = getT3workKickoffProviderBlocker({
      isConnected,
      hasConfiguredProviders,
      providerInstanceEntries,
      selectedProviderEntry,
    });
    const canSend = (Boolean(text.trim()) || Boolean(selectedRecipe)) && !providerStatusMessage;
    const providerPickerDisabled = !isConnected || providerInstanceEntries.length === 0;

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
            <KickoffComposerEditor
              editorRef={editorRef}
              text={text}
              cursor={cursor}
              skills={selectedProvider?.skills ?? []}
              commandMenu={commandMenu}
              placeholder={
                isConnected
                  ? selectedRecipe
                    ? getT3workSelectedRecipeComposerPlaceholder(selectedRecipe)
                    : "Ask anything, @tag files/folders, $use skills, or / for commands"
                  : "Server is disconnected"
              }
              disabled={!isConnected}
              onChangeText={(nextValue, nextCursor) => {
                setText(nextValue);
                setCursor(nextCursor);
              }}
            />
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
              providerPickerDisabled={providerPickerDisabled}
              providerStatusMessage={providerStatusMessage}
              showInteractionModeToggle={showInteractionModeToggle}
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
