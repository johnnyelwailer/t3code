import type { T3workToolId } from "@t3tools/project-context/t3workToolCatalog";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";

export type T3workThreadToolId = T3workToolId;

export type ProjectThread = {
  id: string;
  projectId: string;
  parentThreadId?: string;
  ticketId?: string;
  dashboardMode?: ProjectDashboardMode;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffModelSelection?: import("@t3tools/contracts").ModelSelection;
  kickoffRuntimeMode?: import("@t3tools/contracts").RuntimeMode;
  kickoffInteractionMode?: import("@t3tools/contracts").ProviderInteractionMode;
  selectedToolIds?: ReadonlyArray<T3workThreadToolId>;
  status: "idle" | "running" | "completed" | "error";
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
  label: "Working" | "Completed" | "Error" | "Idle";
  colorClass: string;
  dotClass: string;
  pulse: boolean;
};
