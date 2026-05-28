import type {
  ClientOrchestrationCommand,
  ServerConfig,
  ServerConfigStreamEvent,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import type {
  DiscoverProjectRecipesRequest,
  DiscoverProjectRecipesResponse,
  LaunchProjectRecipeWorkflowRequest,
  LaunchProjectRecipeWorkflowResponse,
  SubmitProjectRecipeCardActionRequest,
  SubmitProjectRecipeCardActionResponse,
} from "@t3tools/project-recipes";
import type { AtlassianBackendApi } from "./t3work-atlassianBackendTypes";
import type {
  GitHubAssetDownloadRequest,
  GitHubDownloadedAsset,
} from "~/t3work/backend/t3work-githubAssetTypes";
import type {
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
} from "~/t3work/backend/t3work-githubTypes";
import type { T3workTurnToolContext } from "~/t3work/t3work-threadToolContext";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface BackendState {
  readonly connectionStatus: ConnectionStatus;
  readonly serverConfig: ServerConfig | null;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly error: string | null;
}

export type T3workThreadPlacement = {
  readonly threadId: ThreadId;
  readonly parentThreadId?: ThreadId;
  readonly ticketId?: string;
};

export interface BackendApi {
  readonly state: BackendState;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly dispatchCommand: (command: ClientOrchestrationCommand) => Promise<void>;
  readonly launchRecipeWorkflow: (
    input: LaunchProjectRecipeWorkflowRequest,
  ) => Promise<LaunchProjectRecipeWorkflowResponse>;
  readonly submitRecipeCardAction: (
    input: SubmitProjectRecipeCardActionRequest,
  ) => Promise<SubmitProjectRecipeCardActionResponse>;
  readonly listThreadPlacements: (input: {
    readonly threadIds?: ReadonlyArray<string>;
  }) => Promise<ReadonlyArray<T3workThreadPlacement>>;
  readonly syncThreadToolContext: (input: {
    readonly threadId: string;
    readonly toolContext?: T3workTurnToolContext | null;
  }) => Promise<void>;
  readonly atlassian: AtlassianBackendApi;
  readonly github: GitHubBackendApi;
  readonly projectWorkspace: ProjectWorkspaceBackendApi;
  readonly subscribeConfig: (listener: (event: ServerConfigStreamEvent) => void) => () => void;
  readonly subscribeLifecycle: (listener: (event: unknown) => void) => () => void;
  readonly subscribeShell: (listener: (event: unknown) => void) => () => void;
  readonly subscribeThread: (threadId: string, listener: (event: unknown) => void) => () => void;
}

export type LinkedRepositorySyncResult = {
  readonly url: string;
  readonly localPath: string;
  readonly status: "cloned" | "updated" | "failed";
  readonly error?: string;
};

export type ProjectWorkspaceBootstrapResult = {
  readonly workspaceRoot: string;
  readonly workspaceRepositoryInitialized: boolean;
  readonly referencesRoot: string;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositorySyncResult>;
};

export type ProjectWorkspaceContextFile = {
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
};

export type ProjectWorkspaceWriteContextFilesResult = {
  readonly workspaceRoot: string;
  readonly writtenFiles: ReadonlyArray<string>;
};

export interface ProjectWorkspaceBackendApi {
  readonly bootstrapWorkspace: (input: {
    readonly workspaceRoot: string;
    readonly linkedRepositoryUrls?: ReadonlyArray<string>;
    readonly setupProfileId?: string;
  }) => Promise<ProjectWorkspaceBootstrapResult>;
  readonly discoverRecipes: (
    input: DiscoverProjectRecipesRequest,
  ) => Promise<DiscoverProjectRecipesResponse>;
  readonly writeContextFiles: (input: {
    readonly workspaceRoot: string;
    readonly files: ReadonlyArray<ProjectWorkspaceContextFile>;
  }) => Promise<ProjectWorkspaceWriteContextFilesResult>;
}

export type GitHubRepositoryCandidate = {
  readonly id: string;
  readonly nameWithOwner: string;
  readonly url: string;
  readonly host: string;
  readonly updatedAt?: string;
  readonly description?: string;
  readonly isPrivate?: boolean;
};

export type GitHubInboxItem = {
  readonly id: string;
  readonly repository: string;
  readonly repositoryUrl?: string;
  readonly reason: string;
  readonly authorLogin?: string;
  readonly authorAvatarUrl?: string;
  readonly reviewRequested?: boolean;
  readonly subjectType?: string;
  readonly subjectTitle?: string;
  readonly subjectUrl?: string;
  readonly subjectBranch?: string;
  readonly subjectState?: "open" | "closed" | "merged" | "draft";
  readonly commentCount?: number;
  readonly reviewCommentCount?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changedFiles?: number;
  readonly updatedAt?: string;
};

export type GitHubInboxDiscoverResponse = {
  readonly host: string;
  readonly account?: string;
  readonly repositories: ReadonlyArray<GitHubRepositoryCandidate>;
  readonly inboxItems: ReadonlyArray<GitHubInboxItem>;
  readonly suggestedRepositoryUrls: ReadonlyArray<string>;
  readonly inboxWarning?: string;
};

export interface GitHubBackendApi {
  readonly discoverInbox: (input: {
    readonly host: string;
    readonly projectKey?: string;
    readonly projectTitle?: string;
    readonly linkedRepositoryUrls?: ReadonlyArray<string>;
  }) => Promise<GitHubInboxDiscoverResponse>;
  readonly getPullRequestContext: (
    input: GitHubPullRequestContextRequest,
  ) => Promise<GitHubPullRequestContextResponse>;
  readonly downloadAsset: (input: GitHubAssetDownloadRequest) => Promise<GitHubDownloadedAsset>;
}

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
} from "./t3work-atlassianBackendTypes";

export interface T3WorkEnvironmentConnection {
  readonly environmentId: string;
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly dispose: () => Promise<void>;
}

export interface T3WorkBackend {
  readonly createEnvironmentConnection: (
    wsBaseUrl: string,
    httpBaseUrl: string,
  ) => Promise<T3WorkEnvironmentConnection>;
}

export interface T3WorkAuthState {
  status: "checking" | "authenticated" | "unauthenticated";
}

export interface T3WorkBackendProviderProps {
  readonly backend: T3WorkBackend;
  readonly children: React.ReactNode;
}

export interface T3WorkAuthProviderProps {
  readonly children: React.ReactNode;
}
