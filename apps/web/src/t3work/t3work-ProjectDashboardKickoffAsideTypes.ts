import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type {
  ProjectThread,
  T3workKickoffWorkflow,
  T3workThreadToolId,
} from "~/t3work/t3work-types";

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
    selectedToolIds: ReadonlyArray<T3workThreadToolId>,
    kickoffContextAttachments: ReadonlyArray<T3WorkContextAttachment>,
    kickoffWorkflow?: T3workKickoffWorkflow,
  ) => void;
};
