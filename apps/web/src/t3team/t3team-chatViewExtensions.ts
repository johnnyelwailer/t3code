import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { HTMLAttributes, ReactNode } from "react";

import type { ChatMessage } from "~/types";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";

export type TurnStartOverrideResult = boolean | "resolved-input";

export type ChatViewT3TeamExtensionProps = {
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
  readonly composerContextAttachments?: ReadonlyArray<T3TeamContextAttachment>;
  readonly prepareComposerContextAttachments?: () => Promise<
    ReadonlyArray<T3TeamContextAttachment>
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
  readonly onControlWorkflow?: (input: {
    readonly workflowRunId: string;
    readonly action: "pause" | "resume" | "stop";
  }) => Promise<{ readonly status: "suspended" | "sleeping" | "paused" | "cancelled" }>;
  /**
   * Open a peer actor thread (same project) — wired to router navigation by the
   * host and threaded down to the actor-message timeline card. Kept as an
   * injected callback so the card stays router-agnostic.
   */
  readonly onOpenThread?: (input: {
    readonly projectId: string;
    readonly threadId: string;
  }) => void;
};
