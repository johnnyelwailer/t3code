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
  /**
   * Offline outbox hook for the "Not connected" send gate: instead of
   * erroring, hand the would-be turn start to the host. Returns true when the
   * send was queued (the composer clears it); false to keep the stock toast.
   */
  readonly enqueueOfflineTurnStart?: (turnStart: {
    readonly threadId: string;
    readonly messageId: string;
    readonly messageText: string;
    readonly modelSelection: ModelSelection | null;
    readonly titleSeed: string;
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
    readonly createdAt: string;
    readonly hasAttachments: boolean;
  }) => boolean | Promise<boolean>;
  /**
   * Host banner in the composer's leading dock, after the active-workflow dock and next to the
   * native server queue (`QueuedRunsControl`). The t3team offline outbox lists its waiting sends
   * here: one queue surface, one place.
   */
  readonly composerBannerLeading?: ReactNode;
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
  }) => Promise<{
    readonly status: "suspended" | "sleeping" | "paused" | "cancelled" | "running";
  }>;
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
