import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type {
  ProjectThread,
  T3TeamKickoffWorkflow,
  T3TeamThreadToolId,
} from "~/t3team/t3team-types";

export type ProjectDashboardKickoffAsideProps = {
  project: ProjectShellProject;
  dashboardMode: ProjectDashboardMode;
  projectThreads: ProjectThread[];
  activeThread: ProjectThread | null;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenThread: (threadId: string) => void;
  onOpenFullThread?: (threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onKickoffThread: (
    kickoffMessage: string,
    kickoffPending: boolean | undefined,
    kickoffModelSelection: ModelSelection,
    kickoffRuntimeMode: RuntimeMode,
    kickoffInteractionMode: ProviderInteractionMode,
    selectedToolIds: ReadonlyArray<T3TeamThreadToolId>,
    kickoffContextAttachments: ReadonlyArray<T3TeamContextAttachment>,
    kickoffWorkflow?: T3TeamKickoffWorkflow,
  ) => void;
};
