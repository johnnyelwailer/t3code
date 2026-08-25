import type { T3TeamActionRecipeContext } from "@t3tools/project-context";
import type { T3TeamToolId } from "@t3tools/project-context/t3teamToolCatalog";
import type {
  ProjectRecipeKickoffProgram,
  ProjectRecipeLaunchSource,
  RecipeSurface,
} from "@t3tools/project-recipes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ActivityState } from "~/t3team/t3team-activityStateDisplay";

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
  providerKind?: "codex" | "claudeAgent";
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
  /** GHE #40: live LLM-generated 2–4 word label for what an active thread is working
   *  on NOW; rendered on the Working pill while present. Absent/idle = static "Working". */
  activityLabel?: string | null;
  /** GHE #208: deterministic 4-state activity word (thinking/writing/working/waiting);
   *  the base pill word while a turn runs. Absent/idle = null. */
  activityState?: ActivityState | null;
  activityStateUpdatedAt?: string | null;
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
  readonly issueTypeId?: string;
  readonly assigneeAccountId?: string | null;
};

export type ViewState =
  // "My work" across every bound project, reached from the Work lens when the sidebar's project
  // selector is on "All projects". Project-less by definition — it is the one Team surface whose
  // subject is the viewer rather than a project.
  | { type: "all-my-work" }
  | { type: "dashboard"; projectId: string; embeddedThreadId?: string }
  | { type: "ticket"; projectId: string; ticketId: string; embeddedThreadId?: string }
  | {
      type: "thread";
      projectId: string;
      threadId: string;
      embeddedThreadId?: string;
    }
  // A draft thread is not a server thread yet, so it has no threadId and its
  // project is derived from the composer draft store rather than the route.
  | {
      type: "draft";
      draftId: string;
      projectId?: string;
      embeddedThreadId?: string;
    };

export function readActiveThreadIdFromView(view: ViewState | null): string | null {
  if (!view) {
    return null;
  }

  if (view.type === "thread") {
    return view.threadId;
  }

  if (view.type === "all-my-work") {
    return null;
  }

  return view.embeddedThreadId ?? null;
}

/**
 * The project a view is about, or `null` when it is about none.
 *
 * Most views carry a `projectId`, but not all: a draft's project lives in the composer draft
 * store, and `all-my-work` is deliberately project-less (its subject is the viewer). Reaching for
 * `view.projectId` directly is therefore a type error by design — go through this instead, so a
 * future project-less view forces the same decision at every call site rather than none of them.
 */
export function readProjectIdFromView(view: ViewState | null): string | null {
  if (!view) {
    return null;
  }

  if (view.type === "all-my-work") {
    return null;
  }

  return view.projectId ?? null;
}

export type {
  ProjectSortOrder,
  ThreadSortOrder,
  ThreadStatusPill,
} from "./t3team-threadStatusPillTypes";
