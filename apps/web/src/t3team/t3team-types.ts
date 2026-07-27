import type { T3TeamActionRecipeContext } from "@t3tools/project-context";
import type { T3TeamToolId } from "@t3tools/project-context/t3teamToolCatalog";
import type {
  ProjectRecipeKickoffProgram,
  ProjectRecipeLaunchSource,
  RecipeSurface,
} from "@t3tools/project-recipes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";

export type T3TeamThreadToolId = T3TeamToolId;

export type ProjectThreadDisplayMode = "embedded" | "thread";

export type T3TeamKickoffWorkflow = {
  readonly kind: "recipe";
  readonly recipeId: string;
  readonly recipeVersion?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly kickoff?: ProjectRecipeKickoffProgram;
  readonly title: string;
  readonly description: string;
  readonly source: ProjectRecipeLaunchSource;
  readonly surface: RecipeSurface;
  readonly reason?: string;
  readonly recipePath?: string;
  readonly promptPath?: string;
  readonly workflowPath?: string;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly launchContext?: T3TeamActionRecipeContext;
};

export type ProjectThread = {
  id: string;
  projectId: string;
  parentThreadId?: string;
  ticketId?: string;
  ticketDisplayId?: string;
  dashboardMode?: ProjectDashboardMode;
  displayMode?: ProjectThreadDisplayMode;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffModelSelection?: import("@t3tools/contracts").ModelSelection;
  kickoffRuntimeMode?: import("@t3tools/contracts").RuntimeMode;
  kickoffInteractionMode?: import("@t3tools/contracts").ProviderInteractionMode;
  selectedToolIds?: ReadonlyArray<T3TeamThreadToolId>;
  kickoffWorkflow?: T3TeamKickoffWorkflow;
  status: "idle" | "running" | "completed" | "error";
  /** Workflow repair/one-shot child threads may be opened directly but are never navigation. */
  retention?: "ephemeral" | "retained";
  /** ISO instant a scheduled-workflow run on this thread is sleeping until (Epic 27), or
   * absent when no run is clock-parked. Drives the "Sleeping until <time>" status pill.
   * Sourced from `workflow_runs.wake_at`, joined onto the thread shell DTO by launch_thread_id. */
  sleepingUntil?: string;
  workflowRunStatus?: {
    readonly runId?: string;
    readonly status:
      | "queued"
      | "running"
      | "suspended"
      | "sleeping"
      | "paused"
      | "completed"
      | "failed"
      | "cancelled";
    readonly pendingKind: "thread.turn" | "user.input" | null;
    readonly wakeAt: string | null;
    readonly updatedAt: string;
  };
  /** Compact server-generated summary for a child thread; never a chat message. */
  childStatus?: string | null;
  childStatusUpdatedAt?: string | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
};

export type ProjectTicket = {
  id: string;
  projectId: string;
  parentId?: string;
  description?: string;
  ref: {
    provider: string;
    kind: string;
    id: string;
    displayId: string;
    title: string;
    type?: string;
    issueTypeIconUrl?: string;
    url: string;
    projectId: string;
  };
  issueType?: string;
  issueTypeIsSubtask?: boolean;
  issueTypeIconUrl?: string;
  status: string;
  priority?: string;
  assignee?: string;
  assigneeAccountId?: string;
  estimateValue?: number;
  timeOriginalEstimateSeconds?: number;
  timeRemainingEstimateSeconds?: number;
  aggregateTimeOriginalEstimateSeconds?: number;
  aggregateTimeRemainingEstimateSeconds?: number;
  subtaskCount?: number;
  sprintId?: string;
  sprintName?: string;
  sprintState?: string;
  sprintBoardId?: string;
  sprintGoal?: string;
  sprintStartDate?: string;
  sprintEndDate?: string;
  sprintCompleteDate?: string;
  updatedAt: string;
  labels?: ReadonlyArray<string>;
};

export type ProjectBacklogSubtaskCreateInput = {
  readonly summary: string;
  readonly description?: string;
  readonly estimateHours?: number;
};

export type ViewState =
  | { type: "dashboard"; projectId: string; embeddedThreadId?: string }
  | { type: "ticket"; projectId: string; ticketId: string; embeddedThreadId?: string }
  | {
      type: "thread";
      projectId: string;
      threadId: string;
      embeddedThreadId?: string;
    };

export function readActiveThreadIdFromView(view: ViewState | null): string | null {
  if (!view) {
    return null;
  }

  if (view.type === "thread") {
    return view.threadId;
  }

  return view.embeddedThreadId ?? null;
}

export type ProjectSortOrder = "updated_at" | "created_at";
export type ThreadSortOrder = "updated_at" | "created_at";

export type ThreadStatusPill = {
  label:
    | "Running"
    | "Waiting for agent"
    | "Waiting for your answer"
    | "Scheduled"
    | "Paused"
    | "Stopped"
    | "Complete"
    | "Needs attention"
    | "Queued"
    | "Working"
    | "Completed"
    | "Error"
    | "Idle"
    | "Sleeping";
  /** Optional trailing context for the pill — the wake time for a `Sleeping` routine
   * ("until Mon 09:00"), shown after the label in its tooltip. */
  detail?: string;
  colorClass: string;
  dotClass: string;
  pulse: boolean;
};
