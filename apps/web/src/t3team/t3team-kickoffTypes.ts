import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { T3TeamKickoffWorkflow, T3TeamThreadToolId } from "~/t3team/t3team-types";

export type ProjectKickoffThreadInput = {
  projectId: string;
  dashboardMode?: ProjectDashboardMode;
  kickoffMessage: string;
  kickoffPending?: boolean;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  selectedToolIds: ReadonlyArray<T3TeamThreadToolId>;
  kickoffContextAttachments: ReadonlyArray<T3TeamContextAttachment>;
  kickoffWorkflow?: T3TeamKickoffWorkflow;
};

export type TicketKickoffThreadInput = ProjectKickoffThreadInput & {
  ticketId: string;
  ticketDisplayId: string;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
};
