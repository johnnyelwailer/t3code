import { BotIcon } from "lucide-react";
import type { ProviderInteractionMode, ProviderInstanceId, RuntimeMode } from "@t3tools/contracts";
import type { ProviderInstanceEntry } from "~/providerInstances";
import { ComposerPrimaryActions } from "~/components/chat/ComposerPrimaryActions";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/t3work/components/ui/t3work-button";
import type {
  RuntimeModeConfig,
  RuntimeModeOption,
} from "~/t3work/t3work-ticketKickoffRuntimeConfig";

export function TicketKickoffComposerControls({
  selectedInstanceId,
  selectedModel,
  runtimeMode,
  interactionMode,
  runtimeOption,
  runtimeModeOptions,
  runtimeModeConfig,
  providerInstanceEntries,
  modelOptionsByInstance,
  selectedProviderEntry,
  showInteractionModeToggle,
  isConnected,
  text,
  canSend,
  setSelectedInstanceId,
  setSelectedModel,
  setInteractionMode,
  setRuntimeMode,
}: {
  selectedInstanceId: ProviderInstanceId;
  selectedModel: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  runtimeOption: RuntimeModeOption;
  runtimeModeOptions: ReadonlyArray<RuntimeMode>;
  runtimeModeConfig: RuntimeModeConfig;
  providerInstanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  modelOptionsByInstance: ReadonlyMap<
    ProviderInstanceId,
    ReadonlyArray<{ slug: string; name: string; isCustom: boolean; subProvider?: string }>
  >;
  selectedProviderEntry: ProviderInstanceEntry | undefined;
  showInteractionModeToggle: boolean;
  isConnected: boolean;
  text: string;
  canSend: boolean;
  setSelectedInstanceId: (instanceId: ProviderInstanceId) => void;
  setSelectedModel: (model: string) => void;
  setInteractionMode: (updater: (mode: ProviderInteractionMode) => ProviderInteractionMode) => void;
  setRuntimeMode: (mode: RuntimeMode) => void;
}) {
  const RuntimeModeIcon = runtimeOption.icon;

  return (
    <div
      data-chat-composer-footer="true"
      data-chat-composer-footer-compact="false"
      className="flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-visible px-2.5 pb-2.5 sm:gap-0 sm:px-3 sm:pb-3"
    >
      <div className="-m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ProviderModelPicker
          activeInstanceId={selectedInstanceId}
          model={selectedModel}
          lockedProvider={null}
          instanceEntries={providerInstanceEntries}
          modelOptionsByInstance={modelOptionsByInstance}
          disabled={!isConnected || !selectedProviderEntry}
          onInstanceModelChange={(instanceId, model) => {
            setSelectedInstanceId(instanceId);
            setSelectedModel(model);
          }}
        />
        {showInteractionModeToggle ? (
          <>
            <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
            <Button
              variant="ghost"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
              size="sm"
              type="button"
              onClick={() => setInteractionMode((mode) => (mode === "plan" ? "default" : "plan"))}
            >
              <BotIcon />
              <span className="sr-only sm:not-sr-only">
                {interactionMode === "plan" ? "Plan" : "Build"}
              </span>
            </Button>
          </>
        ) : null}
        <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
        <Select value={runtimeMode} onValueChange={(value) => setRuntimeMode(value!)}>
          <SelectTrigger
            variant="ghost"
            size="sm"
            className="font-medium"
            aria-label="Runtime mode"
            title={runtimeOption.description}
          >
            <RuntimeModeIcon className="size-4" />
            <SelectValue>{runtimeOption.label}</SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {runtimeModeOptions.map((mode) => {
              const option = runtimeModeConfig[mode];
              const OptionIcon = option.icon;
              return (
                <SelectItem key={mode} value={mode} className="min-w-64 py-2">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      {option.label}
                    </span>
                    <span className="text-muted-foreground text-xs leading-4">
                      {option.description}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectPopup>
        </Select>
      </div>
      <div
        data-chat-composer-actions="right"
        data-chat-composer-primary-actions-compact="false"
        className="flex shrink-0 flex-nowrap items-center justify-end gap-2"
      >
        <ComposerPrimaryActions
          compact={false}
          pendingAction={null}
          isRunning={false}
          showPlanFollowUpPrompt={false}
          promptHasText={text.trim().length > 0}
          isSendBusy={false}
          isConnecting={false}
          isEnvironmentUnavailable={!isConnected || !selectedProviderEntry}
          isPreparingWorktree={false}
          hasSendableContent={canSend}
          onPreviousPendingQuestion={() => {}}
          onInterrupt={() => {}}
          onImplementPlanInNewThread={() => {}}
        />
      </div>
    </div>
  );
}
