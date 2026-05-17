import type {
  ClientOrchestrationCommand,
  ServerConfig,
  ServerConfigStreamEvent,
  ServerProvider,
} from "@t3tools/contracts";
import type {
  AtlassianAccessibleResource,
  TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface BackendState {
  readonly connectionStatus: ConnectionStatus;
  readonly serverConfig: ServerConfig | null;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly error: string | null;
}

export interface BackendApi {
  readonly state: BackendState;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly dispatchCommand: (command: ClientOrchestrationCommand) => Promise<void>;
  readonly atlassian: AtlassianBackendApi;
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

export interface ProjectWorkspaceBackendApi {
  readonly bootstrapWorkspace: (input: {
    readonly workspaceRoot: string;
    readonly linkedRepositoryUrls?: ReadonlyArray<string>;
  }) => Promise<ProjectWorkspaceBootstrapResult>;
}

export type AtlassianBasicConnectInput = {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
};

export type AtlassianOAuthConnectInput = {
  readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
  readonly token: TokenExchangeResult;
};

export interface AtlassianBackendApi {
  readonly listAccounts: () => Promise<ReadonlyArray<IntegrationAccount>>;
  readonly connectBasic: (
    input: AtlassianBasicConnectInput,
  ) => Promise<ReadonlyArray<IntegrationAccount>>;
  readonly connectOAuth: (
    input: AtlassianOAuthConnectInput,
  ) => Promise<ReadonlyArray<IntegrationAccount>>;
  readonly listProjects: (
    account: IntegrationAccountRef,
  ) => Promise<ReadonlyArray<ExternalProject>>;
  readonly listResources: (input: {
    readonly account: IntegrationAccountRef;
    readonly externalProjectId: string;
    readonly limit?: number;
  }) => Promise<ResourcePage>;
  readonly getResource: (input: {
    readonly accountId: string;
    readonly ref: unknown;
  }) => Promise<ResourceSnapshot>;
}

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
