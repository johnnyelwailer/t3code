import type { WorktreeSetupSnapshot } from "@t3tools/contracts";
import {
  type EnvironmentId,
  type MessageId,
  type OrchestrationV2TurnItem,
  type RunAttemptId,
  type ScopedThreadRef,
  type ServerProviderSkill,
  type RunId,
  ThreadId,
  type TurnItemId,
} from "@t3tools/contracts";
import type { AsyncResult, Atom } from "effect/reactivity";
import type { CommandOutputView } from "@t3tools/client-runtime/state/command-output";
import type { WorkflowOpening } from "@t3tools/client-runtime/state/subagentRuntime";
import { createContext, type MouseEvent, type ReactNode } from "react";
import { type LegendListRef } from "@legendapp/list/react";
import type { CodexArtifactTemplate } from "@t3tools/shared/codexArtifactTemplates";
import { type ChatFileAttachment } from "../../types";
import { ExpandedImagePreview } from "./ExpandedImagePreview";
import { type AssistantCitationTarget } from "./AssistantCitationSource";
import { type MessagesTimelineRow, type WorkGroupScrollAnchor } from "./MessagesTimeline.logic";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import type { TurnItemDetailSource } from "../../state/queries";
import { type HandoffTimelineRun } from "./V2LifecycleRow";
import type { ThreadJobsController } from "~/t3team/backend/t3team-thread-jobsBackend";
import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";
import type { ActivityState } from "~/t3team/t3team-activityStateDisplay";
import type { BackgroundJobState } from "@t3tools/client-runtime/work-log/background-jobs";

/**
 * Where an expanded row reads an item's detail and a command's output. The owner's rows read them
 * from the environment; the guest page reads them through its own routes.
 */
export interface TurnItemSource {
  readonly detail: TurnItemDetailSource;
  readonly commandOutput: (target: {
    readonly threadId: ThreadId;
    readonly itemId: TurnItemId;
  }) => Atom.Atom<AsyncResult.AsyncResult<CommandOutputView, unknown>>;
}

export interface TimelineRowSharedState {
  citationRequest: AssistantCitationTarget | null;
  listRef: React.RefObject<LegendListRef | null>;
  timestampFormat: TimestampFormat;
  routeThreadKey: string;
  threadRef: ScopedThreadRef | null;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  workspaceRoot: string | undefined;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  runs: ReadonlyArray<HandoffTimelineRun>;
  activeThreadEnvironmentId: EnvironmentId;
  onRevertToTurnCount: (targetTurnCount: number, messageId: MessageId) => void;
  onUseArtifactTemplate: (template: CodexArtifactTemplate) => void;
  onSendAppMessage: ((text: string) => Promise<void>) | undefined;
  onAppFullscreenChange: (rowId: string, fullscreen: boolean) => void;
  onRunShellCommand: ((command: string) => void) | undefined;
  findActive: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  displayThreadKey?: string;
  /** Unset where there is no diff to open, so the timeline shows no "Open diff" button. */
  onOpenTurnDiff: ((runId: RunId, filePath?: string) => void) | undefined;
  /**
   * Draws a published HTML visual. Unset, the row loads it from the environment; the guest page
   * loads it through its own route.
   */
  renderHtmlRender: ((row: Extract<TimelineRow, { kind: "html-render" }>) => ReactNode) | undefined;
  /** Unset, expanded rows read detail and command output from the environment. */
  turnItemSource: TurnItemSource | undefined;
  onOpenThread: (threadId: OrchestrationV2TurnItem["threadId"]) => void;
  workflowOpening: WorkflowOpening | null;
  /** Absent hides "Fork from this response", as in the guest view. */
  onForkFromRun:
    | ((input: { readonly sourceThreadId: ThreadId; readonly runId: RunId }) => Promise<void>)
    | undefined;
  onRollbackCheckpoint: (input: {
    readonly checkpointId: string;
    readonly scopeId: string;
  }) => void;
  onToggleTurnFold: (runId: RunId) => void;
  onToggleAttemptFold: (attemptId: RunAttemptId) => void;
  onFileOpen: (attachment: ChatFileAttachment) => void;
  onFileDownload: (attachment: ChatFileAttachment) => void;
  openPullRequest: (event: MouseEvent<HTMLElement>, url: string) => void;
  onToggleWorkGroup: (groupId: string, anchorKey: string) => void;
  onToggleWorkEntry: (anchorKey: string, collapsed: boolean) => void;
  onCancelWorktreeSetup: (() => void) | null;
  retryableWorkspacePreparationRunIds: ReadonlySet<RunId>;
  onRetryWorkspacePreparation: ((runId: RunId) => void) | null;
  onWorktreeSetupWorkLocally: (() => void) | null;
  onOpenWorktreeSetupTerminal: ((terminalId: string) => void) | null;
  workGroupViewState: WorkGroupViewState;
  /** t3team: out-of-band background-job control (list/cancel/read-output) — see the jobs route. */
  threadJobsController: ThreadJobsController | undefined;
  /**
   * t3team: background bash jobs (transcript fold of the "background job: job_xxx"
   * tool-result markers), keyed by the work-row id that yielded the job. A row
   * whose job is still running gets a "running in background" tag instead of
   * reading as a finished call.
   */
  backgroundJobStarters: ReadonlyMap<string, BackgroundJobState>;
}

export interface TimelineRowActivityState {
  isWorking: boolean;
  isCompacting: boolean;
  isRevertingCheckpoint: boolean;
  activeTurnInProgress: boolean;
  awaitingUser: boolean;
  isPreparingWorktree: boolean;
  latestRunId: RunId | null;
  backgroundWorktreeSetup: WorktreeSetupSnapshot | null;
  /**
   * Dedup vs. the provider's own thinking trace: an active live row that shows a
   * reasoning entry already renders the live "Thinking" surface for the current
   * run, so the working row's state word falls back to "Working".
   */
  liveReasoningTrace?: boolean;
  /** Current plan step label for the working row, when the run has a plan. */
  workingStepLabel: string | null;
  /**
   * Active agents (running child threads + live subagents).
   */
  activeAgents: readonly ActiveAgentEntry[];
  /**
   * Background bash jobs folded from this thread's transcript. The working row
   * renders the running ones, so a settled run with live work still shows a
   * live line instead of reading as idle.
   */
  backgroundJobs: readonly BackgroundJobState[];
  /**
   * Opens the agents surface from the working-row indicator.
   */
  onOpenAgents: () => void;
  /**
   * Opens ONE agent (per-dot click).
   */
  onOpenAgent?: ((entry: ActiveAgentEntry) => void) | undefined;
  /**
   * The thread's deterministic activity state; null falls back to the base word.
   */
  threadActivityState?: ActivityState | null;
  /** GHE #40: the thread's live LLM activity label (flag-gated by the caller). */
  threadActivityLabel?: string | null;
}

export const TimelineRowCtx = createContext<TimelineRowSharedState>(null!);

export const TimelineRowActivityCtx = createContext<TimelineRowActivityState>(null!);

export interface WorkGroupViewState {
  scrollPositions: Map<string, WorkGroupScrollAnchor>;
  expandedEntries: Set<string>;
}

export const WorkGroupViewCtx = createContext<{
  state: WorkGroupViewState;
  onToggleEntry: (collapsed: boolean) => void;
} | null>(null);

export type TimelineWorkEntry = Extract<
  MessagesTimelineRow,
  { kind: "work" }
>["groupedEntries"][number];

export type TimelineRow = MessagesTimelineRow;
