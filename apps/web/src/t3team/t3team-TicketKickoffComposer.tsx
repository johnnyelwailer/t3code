import { forwardRef, useCallback, useImperativeHandle } from "react";
import { cn } from "~/lib/utils";
import { KickoffComposerEditor } from "~/t3team/composer/t3team-KickoffComposerEditor";
import type {
  T3TeamKickoffComposerHandle,
  T3TeamKickoffComposerProps,
} from "~/t3team/composer/t3team-kickoffComposerProps";
import { useT3TeamKickoffComposerMenu } from "~/t3team/composer/t3team-useKickoffComposerMenu";
import { useT3TeamKickoffComposerText } from "~/t3team/composer/t3team-useKickoffComposerText";
import { useAddToChatComposerDropTarget } from "~/t3team/hooks/t3team-useAddToChatComposerDropTarget";
import {
  createDefaultT3TeamKickoffLaunchConfig,
  getT3TeamKickoffProviderBlocker,
  useT3TeamKickoffComposerState,
  type T3TeamKickoffLaunchConfig,
} from "~/t3team/t3team-kickoffLaunchConfig";
import { TicketKickoffComposerControls } from "~/t3team/t3team-TicketKickoffComposerControls";
import { TicketKickoffComposerSelectedRecipe } from "~/t3team/t3team-TicketKickoffComposerSelectedRecipe";
import { getT3TeamSelectedRecipeComposerPlaceholder } from "~/t3team/t3team-recipeQuickStartLaunch";
import { runtimeModeConfig, runtimeModeOptions } from "~/t3team/t3team-ticketKickoffRuntimeConfig";

export { createDefaultT3TeamKickoffLaunchConfig };
export type { T3TeamKickoffLaunchConfig };
export type { T3TeamKickoffComposerHandle };

export const TicketKickoffComposer = forwardRef<
  T3TeamKickoffComposerHandle,
  T3TeamKickoffComposerProps
>(
  (
    {
      prefillText,
      selectedRecipe,
      onClearSelectedRecipe,
      providers,
      isConnected,
      workspaceRoot,
      slashRecipes,
      onSelectSlashRecipe,
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
    } = useT3TeamKickoffComposerState(providers);
    const { text, cursor, editorRef, setText, setCursor } = useT3TeamKickoffComposerText({
      prefillText,
      hasSelectedRecipe: Boolean(selectedRecipe),
    });

    const commandMenu = useT3TeamKickoffComposerMenu({
      selectedProvider,
      workspaceRoot: workspaceRoot ?? null,
      editorRef,
      text,
      cursor,
      setText,
      setCursor,
      setInteractionMode,
      ...(slashRecipes ? { slashRecipes } : {}),
      ...(onSelectSlashRecipe ? { onSelectRecipe: onSelectSlashRecipe } : {}),
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

    const providerStatusMessage = getT3TeamKickoffProviderBlocker({
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
                    ? getT3TeamSelectedRecipeComposerPlaceholder(selectedRecipe)
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
