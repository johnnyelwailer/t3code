import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { T3workKickoffWorkflow, T3workThreadToolId } from "~/t3work/t3work-types";

export type ProjectKickoffThreadInput = {
  projectId: string;
  dashboardMode?: ProjectDashboardMode;
  kickoffMessage: string;
  kickoffPending?: boolean;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  selectedToolIds: ReadonlyArray<T3workThreadToolId>;
  kickoffContextAttachments: ReadonlyArray<T3WorkContextAttachment>;
  kickoffWorkflow?: T3workKickoffWorkflow;
};

export type TicketKickoffThreadInput = ProjectKickoffThreadInput & {
  ticketId: string;
  ticketDisplayId: string;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
};
