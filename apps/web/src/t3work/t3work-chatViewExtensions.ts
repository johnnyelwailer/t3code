import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { HTMLAttributes, ReactNode } from "react";

import type { ChatMessage } from "~/types";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";

export type TurnStartOverrideResult = boolean | "resolved-input";

export type ChatViewT3workExtensionProps = {
  readonly syntheticMessages?: ReadonlyArray<ChatMessage>;
  readonly onBack?: () => void;
  readonly headerAccessory?: ReactNode;
  readonly titleBarControlsAccessory?: ReactNode;
  readonly hideHeader?: boolean;
  readonly hideBranchToolbar?: boolean;
  readonly minimalComposer?: boolean;
  readonly beforeDispatchTurnStart?: () => void | Promise<void>;
  readonly dispatchTurnStartOverride?: (turnStart: {
    readonly threadId: string;
    readonly messageId: string;
    readonly messageText: string;
    readonly modelSelection: ModelSelection;
    readonly titleSeed: string;
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
    readonly createdAt: string;
    readonly hasAttachments: boolean;
  }) => Promise<TurnStartOverrideResult>;
  readonly composerContextAttachmentSlot?: ReactNode;
  readonly composerContainerProps?: HTMLAttributes<HTMLDivElement>;
  readonly composerContainerOverlay?: ReactNode;
  readonly composerContextAttachments?: ReadonlyArray<T3WorkContextAttachment>;
  readonly prepareComposerContextAttachments?: () => Promise<
    ReadonlyArray<T3WorkContextAttachment>
  >;
  readonly onComposerContextAttachmentsConsumed?: () => void;
  readonly onSubmitRecipeCardAction?: (action: {
    readonly cardId: string;
    readonly actionId: string;
    readonly submit?: Record<string, unknown>;
  }) => void | Promise<void>;
  readonly dispatchWorkflowDecision?: (decision: {
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly value: unknown;
    readonly correlationId: string;
  }) => void | Promise<void>;
};
