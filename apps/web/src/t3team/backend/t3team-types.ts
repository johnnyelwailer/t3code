import type { ServerConfig, ServerProvider, ThreadId } from "@t3tools/contracts";
import type {
  ProjectWorkspaceRefreshWorkItemContextResult,
  ProjectWorkspaceRefreshWorkItemSliceContextResult,
} from "./t3team-types-workspaceRefresh";
import type {
  DiscoverProjectRecipesRequest,
  DiscoverProjectRecipesResponse,
  LaunchProjectRecipeWorkflowRequest,
  LaunchProjectRecipeWorkflowResponse,
  SubmitProjectRecipeCardActionRequest,
  SubmitProjectRecipeCardActionResponse,
} from "@t3tools/project-recipes";
import type { AtlassianBackendApi } from "./t3team-atlassianBackendTypes";
import type { GitHubBackendApi } from "./t3team-githubBackendTypes";
import type { T3TeamOrchestrationApi } from "./t3team-orchestrationApi";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface BackendState {
  readonly connectionStatus: ConnectionStatus;
  readonly serverConfig: ServerConfig | null;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly error: string | null;
}

export type T3TeamThreadPlacement = {
  readonly threadId: ThreadId;
  readonly parentThreadId?: ThreadId;
  readonly ticketId?: string;
};

export interface BackendApi {
  readonly httpBaseUrl?: string;
  readonly state: BackendState;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  /** Thread and project writes (V2 client operations) on the primary environment. */
  readonly orchestration: T3TeamOrchestrationApi;
  readonly launchRecipeWorkflow: (
    input: LaunchProjectRecipeWorkflowRequest,
  ) => Promise<LaunchProjectRecipeWorkflowResponse>;
  /** Headless recipe launch (S5b): no thread — the run belongs to the project only. Optional so
   * surface-scoped mock backends can omit it; `launchRecipe` rejects on its absence. */
  readonly launchRecipeHeadless?: (input: {
    readonly projectId: string;
    readonly recipeId: string;
    readonly action?: string;
    readonly args?: Record<string, unknown>;
    readonly surfaceContext?: Record<string, unknown>;
  }) => Promise<{ readonly runId: string; readonly status: string }>;
  readonly submitRecipeCardAction: (
    input: SubmitProjectRecipeCardActionRequest,
  ) => Promise<SubmitProjectRecipeCardActionResponse>;
  /**
   * Answer a workflow's pending `askUser`: posts the user's reply as a real (visible) message on
   * the thread. The workflow-engine reactor resolves the parked `user.input` from that message
   * event — no separate agent turn is started, and there is a single resolution path.
   */
  readonly resolveWorkflowInput: (input: {
    readonly threadId: string;
    readonly text: string;
    /** The composer's optimistic message id, so the server message reconciles with it. */
    readonly messageId: string;
    /** Structured reply value (a decision-card choice); the server validates it against the
     * pending ask's affordance and the engine schema-validates it on resume. */
    readonly value?: unknown;
    /** The decision card's ask — rejected by the server if it is no longer the pending one. */
    readonly correlationId?: string;
  }) => Promise<void>;
  readonly controlWorkflow?: (input: {
    readonly threadId: string;
    readonly workflowRunId: string;
    readonly action: "pause" | "resume" | "stop";
  }) => Promise<{
    readonly ok: boolean;
    readonly status: "suspended" | "sleeping" | "paused" | "cancelled" | "running";
  }>;
  readonly listThreadPlacements: (input: {
    readonly threadIds?: ReadonlyArray<string>;
  }) => Promise<ReadonlyArray<T3TeamThreadPlacement>>;
  readonly syncThreadToolContext: (input: {
    readonly threadId: string;
    readonly toolContext?: T3TeamTurnToolContext | null;
  }) => Promise<void>;
  readonly atlassian: AtlassianBackendApi;
  readonly github: GitHubBackendApi;
  readonly projectWorkspace: ProjectWorkspaceBackendApi;
}

/** One linked repository. `status` is its checkout's last settled state (`pending` until the
 * first clone lands); `syncState` is set while a background clone/fetch is queued or running. */
export type LinkedRepositorySyncResult = {
  readonly url: string;
  readonly localPath: string;
  readonly status: "pending" | "cloned" | "updated" | "failed";
  readonly error?: string;
  readonly syncedAt?: string;
  readonly syncState?: "queued" | "cloning" | "updating";
};

export interface ProjectWorkspaceBackendApi {
  readonly bootstrapWorkspace: (input: {
    readonly workspaceRoot: string;
    readonly linkedRepositoryUrls?: ReadonlyArray<string>;
    readonly setupProfileId?: string;
    /** An explicit save: refetch every linked repository instead of honoring the throttle. */
    readonly refreshLinkedRepositories?: boolean;
    readonly customProfile?: import("@t3tools/t3team-skill-packs").T3TeamProfile;
  }) => Promise<ProjectWorkspaceBootstrapResult>;
  /** The linked repositories' recorded state plus live background-sync phases. No git work. */
  readonly readLinkedRepositoryStatus: (input: {
    readonly workspaceRoot: string;
  }) => Promise<{ readonly linkedRepositories: ReadonlyArray<LinkedRepositorySyncResult> }>;
  /** Sets the project's main repository (`url: null` = the project's own workspace). */
  readonly setMainRepository: (input: {
    readonly projectId: string;
    readonly url: string | null;
    readonly selection?: "user" | "detected";
  }) => Promise<ProjectMainRepositorySwitchResult>;
  readonly discoverRecipes: (
    input: DiscoverProjectRecipesRequest,
  ) => Promise<DiscoverProjectRecipesResponse>;
  readonly writeContextFiles: (input: {
    readonly workspaceRoot: string;
    readonly files: ReadonlyArray<ProjectWorkspaceContextFile>;
  }) => Promise<ProjectWorkspaceWriteContextFilesResult>;
  readonly refreshWorkItemContext: (input: {
    readonly workspaceRoot: string;
    readonly projectId: string;
    readonly ticketKey: string;
    readonly force?: boolean;
  }) => Promise<ProjectWorkspaceRefreshWorkItemContextResult>;
  readonly refreshWorkItemSliceContext: (input: {
    readonly workspaceRoot: string;
    readonly projectId: string;
    readonly ticketKey: string;
    readonly focusKind: string;
    readonly focusLabel: string;
    readonly summaryItems: ReadonlyArray<{ readonly label: string; readonly value: string }>;
    readonly force?: boolean;
  }) => Promise<ProjectWorkspaceRefreshWorkItemSliceContextResult>;
}

export type {
  GitHubBackendApi,
  GitHubInboxDiscoverResponse,
  GitHubInboxItem,
  GitHubRepositoryCandidate,
} from "./t3team-githubBackendTypes";

export type {
  AtlassianAssignableUser,
  AtlassianBacklogBoard,
  AtlassianBacklogBoardColumn,
  AtlassianBacklogBoardColumnStatus,
  AtlassianBacklogCapabilities,
  AtlassianBoardColumnsResponse,
  AtlassianBacklogResponse,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
  AtlassianBasicConnectInput,
  AtlassianDownloadedAsset,
  AtlassianOAuthConnectInput,
  AtlassianOAuthExchangeInput,
  AtlassianOAuthExchangeResult,
  AtlassianChildIssueType,
  AtlassianIssueLinkType,
} from "./t3team-atlassianBackendTypes";

export interface T3TeamEnvironmentConnection {
  readonly environmentId: string;
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly dispose: () => Promise<void>;
}

export interface T3TeamBackend {
  readonly createEnvironmentConnection: (
    wsBaseUrl: string,
    httpBaseUrl: string,
  ) => Promise<T3TeamEnvironmentConnection>;
}

export interface T3TeamAuthState {
  status: "checking" | "authenticated" | "unauthenticated";
}

export interface T3TeamBackendProviderProps {
  readonly backend: T3TeamBackend;
  readonly children: React.ReactNode;
}

export interface T3TeamAuthProviderProps {
  readonly children: React.ReactNode;
}

// Workspace bootstrap shapes live in their own module; re-exported so importers are unaffected.
import type {
  ProjectMainRepositorySwitchResult,
  ProjectWorkspaceBootstrapResult,
  ProjectWorkspaceContextFile,
  ProjectWorkspaceWriteContextFilesResult,
} from "~/t3team/backend/t3team-projectWorkspaceTypes";
export type {
  ProjectMainRepositorySwitchResult,
  ProjectWorkspaceBootstrapResult,
  ProjectWorkspaceContextFile,
  ProjectWorkspaceWriteContextFilesResult,
} from "~/t3team/backend/t3team-projectWorkspaceTypes";
export type {
  ProjectWorkspaceRefreshWorkItemContextResult,
  ProjectWorkspaceRefreshWorkItemSliceContextResult,
} from "./t3team-types-workspaceRefresh";
