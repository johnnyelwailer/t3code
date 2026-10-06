import type { RelayManagedEndpointRuntimeConfig } from "@t3tools/contracts/relay";
import * as Clock from "effect/Clock";
import * as Random from "effect/Random";
import * as Semaphore from "effect/Semaphore";
import * as StorageCleanup from "./storageCleanup.ts";
import * as PullRequestSyncReactor from "./orchestration-v2/PullRequestSyncReactor.ts";
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeHttp from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentHttpApi, type RepositoryIdentity } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { activateCompiledInDistribution } from "./t3team-distribution-bootstrap.ts";

import * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import * as HostPowerMonitor from "./background/HostPowerMonitor.ts";
import * as ServerConfig from "./config.ts";
import {
  otlpTracesProxyRouteLayer,
  assetRouteLayer,
  attachmentUploadRouteLayer,
  serverEnvironmentHttpApiLayer,
  staticAndDevRouteLayer,
  browserApiCorsLayer,
  httpCompressionLayer,
  untracedRequestsLayer,
} from "./http.ts";
import { guardHttpResponseWriteErrors } from "./httpResponseErrorGuard.ts";
import { fixPath } from "./os-jank.ts";
import { websocketRpcRouteLayer } from "./ws.ts";
import * as ExternalLauncher from "./process/externalLauncher.ts";
import * as NodePtyAdapter from "./terminal/NodePtyAdapter.ts";
import { pullRequestHttpApiLayer } from "./pullRequest/http.ts";
import * as PullRequestProviderRegistry from "./pullRequest/PullRequestProviderRegistry.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
import * as SqlitePersistence from "./persistence/Layers/Sqlite.ts";
import * as PullRequestFilesViewed from "./persistence/PullRequestFilesViewed.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as AnalyticsService from "./telemetry/AnalyticsService.ts";
import * as ProviderEventIngestor from "./orchestration-v2/ProviderEventIngestor.ts";
import * as ModelManifest from "./provider/ModelManifest.ts";
import * as ResetCreditCoordinator from "./provider/Layers/resetCreditCoordinator.ts";
import * as ProviderEventLoggers from "./provider/Layers/ProviderEventLoggers.ts";
import * as OpenCodeRuntime from "./provider/opencodeRuntime.ts";
import * as OpenCodeServerLedger from "./provider/OpenCodeServerLedger.ts";
import { AcpRegistryCatalogLive } from "./provider/Layers/AcpRegistryCatalog.ts";
import * as CheckpointDiffQuery from "./checkpointing/CheckpointDiffQuery.ts";
import * as CheckpointStore from "./checkpointing/CheckpointStore.ts";
import * as AzureDevOpsCli from "./sourceControl/AzureDevOpsCli.ts";
import * as BitbucketApi from "./sourceControl/BitbucketApi.ts";
import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import * as GitLabCli from "./sourceControl/GitLabCli.ts";
import * as ForgejoCli from "./sourceControl/ForgejoCli.ts";
import * as TextGeneration from "./textGeneration/TextGeneration.ts";
import { ProviderInstanceRegistryHydrationLive } from "./provider/Layers/ProviderInstanceRegistryHydration.ts";
import * as TerminalManager from "./terminal/Manager.ts";
import * as McpHttpServer from "./mcp/McpHttpServer.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "./mcp/PreviewAutomationBroker.ts";
import * as DeviceService from "./device/DeviceService.ts";
import { deviceHubProxyRouteLayer } from "./device/DeviceHubProxy.ts";
import * as PreviewManager from "./preview/Manager.ts";
import * as PortScanner from "./preview/PortScanner.ts";
import * as ProcessRunner from "./processRunner.ts";
import * as GitManager from "./git/GitManager.ts";
import * as EnvironmentTheme from "./environmentTheme.ts";
import * as Keybindings from "./keybindings.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import * as AgentAwarenessRelay from "./relay/AgentAwarenessRelay.ts";
import { hasCloudPublicConfig } from "./cloud/publicConfig.ts";
import { ProviderRegistryLive } from "./provider/Layers/ProviderRegistry.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as ProjectEnrichmentService from "./project/ProjectEnrichmentService.ts";
import * as NativeAppIconResolver from "./assets/NativeAppIconResolver.ts";
import * as AntigravityInstallation from "./provider/AntigravityInstallation.ts";
import * as CodexInstallation from "./provider/CodexInstallation.ts";
import * as ProviderInstanceRegistry from "./provider/Services/ProviderInstanceRegistry.ts";
import * as ProviderAdapterRegistry from "./orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderRegistry from "./provider/Services/ProviderRegistry.ts";
import { ProviderUsageLimitsIngestionLive } from "./provider/Layers/ProviderUsageLimitsIngestion.ts";
import * as UsageLimitSources from "./usage/UsageLimitSources.ts";
import * as ProjectFaviconResolver from "./project/ProjectFaviconResolver.ts";
import * as T3ProjectFileLoader from "./project/T3ProjectFileLoader.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import * as WorkspaceEntries from "./workspace/WorkspaceEntries.ts";
import * as WorkspaceFileSystem from "./workspace/WorkspaceFileSystem.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "./vcs/VcsDriverRegistry.ts";
import * as VcsProjectConfig from "./vcs/VcsProjectConfig.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";
import * as VcsProvisioningService from "./vcs/VcsProvisioningService.ts";
import * as VcsStatusBroadcaster from "./vcs/VcsStatusBroadcaster.ts";
import * as ProjectCloneTracker from "./project/ProjectCloneTracker.ts";
import * as GitWorkflowService from "./git/GitWorkflowService.ts";
import * as ReviewService from "./review/ReviewService.ts";
import * as SourceControlProviderRegistry from "./sourceControl/SourceControlProviderRegistry.ts";
import * as PullRequestReadCache from "./pullRequest/PullRequestReadCache.ts";
import * as SourceControlRateLimit from "./sourceControl/SourceControlRateLimit.ts";
import * as SourceControlRepositoryService from "./sourceControl/SourceControlRepositoryService.ts";
import * as WorktreeSetupTracker from "./project/WorktreeSetupTracker.ts";
import { ObservabilityLive } from "./observability/Layers/Observability.ts";
import * as HeapSnapshot from "./observability/HeapSnapshot.ts";
import * as EventLoopMonitor from "./observability/EventLoopMonitor.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as RemoteOpenTargets from "./environment/RemoteOpenTargets.ts";
import { authHttpApiLayer, environmentAuthenticatedAuthLayer } from "./auth/http.ts";
import * as ReplayMarkers from "./auth/replayMarkers.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import {
  connectHttpApiLayer,
  pendingServiceUpdateExists,
  reconcileDesiredCloudLinkIfStillDesired,
  recoverManagedCloudTunnel,
  registerManagedCloudTunnelRecovery,
  startManagedCloudTunnelIfOriginConfirmed,
  releaseManagedTunnelOnShutdown,
} from "./cloud/http.ts";
import { serverRelayBrokerTracingLayer } from "./cloud/relayTracing.ts";
import { shouldRetryCloudLink } from "./cloud/relayResponse.ts";
import * as CloudManagedEndpointRuntime from "./cloud/ManagedEndpointRuntime.ts";
import {
  MANAGED_TUNNEL_FIRST_REGISTRATION_JITTER,
  MANAGED_TUNNEL_RECOVERY_COOLDOWN,
  managedTunnelStartupAction,
  retryManagedTunnelRegistration,
} from "./cloud/managedTunnelStartup.ts";
import * as CloudCliTokenManager from "./cloud/CliTokenManager.ts";
import * as CloudCliState from "./cloud/CliState.ts";
import * as ConnectCredentialMinter from "./cloud/t3team-ConnectCredentialMinter.ts";
import * as Accounts from "./account/t3team-Accounts.ts";
import * as NexiBrokerService from "./cloud/t3team-NexiBrokerService.ts";
import { runConnectCredentialTopUp } from "./cloud/t3team-ConnectCredentialTopUp.ts";
import * as ServerSelfUpdate from "./cloud/selfUpdate.ts";
import * as DesktopAppUpdate from "./desktopUpdate/DesktopAppUpdate.ts";
import * as ServiceLauncherClient from "./cloud/serviceLauncherClient.ts";
import * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import * as HostResources from "./resourceTelemetry/HostResources.ts";
import * as ProcessResourceMonitor from "./diagnostics/ProcessResourceMonitor.ts";
import * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import * as DesktopTelemetryReceiver from "./resourceTelemetry/DesktopTelemetryReceiver.ts";
import * as NativeTelemetryClient from "./resourceTelemetry/NativeTelemetryClient.ts";
import * as ResourceAttribution from "./resourceTelemetry/ResourceAttribution.ts";
import * as ResourceMonitorBinary from "./resourceTelemetry/ResourceMonitorBinary.ts";
import * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import * as UsageService from "./usage/UsageService.ts";
import {
  OrchestrationEventInfrastructureLayerLive,
  OrchestrationV2ProductionLayerLive,
  ProjectServiceLayerLive,
  ProjectSetupScriptRunnerLayerLive,
} from "./orchestration-v2/runtimeLayer.ts";
import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import * as ThreadSearch from "./orchestration-v2/ThreadSearch.ts";
import * as ResourceCleanupService from "./orchestration-v2/ResourceCleanupService.ts";
import * as ThreadSettlementService from "./orchestration-v2/ThreadSettlementService.ts";
import * as ThreadPullRequestService from "./orchestration-v2/ThreadPullRequestService.ts";
import * as RunFinalizationService from "./orchestration-v2/RunFinalizationService.ts";
import * as ProjectionStoreV2 from "./orchestration-v2/ProjectionStore.ts";
import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
} from "./serverRuntimeState.ts";
import { orchestrationHttpApiLayer } from "./orchestration-v2/http.ts";
import { projectHttpApiLayer } from "./project/http.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowSignalStoreLive } from "./persistence/Layers/WorkflowSignalStore.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import * as ToolAuthService from "./toolauth/t3team-ToolAuthService.ts";
import {
  T3TeamThreadToolContextEvictionReactor,
  T3TeamThreadToolContextEvictionReactorLive,
} from "./t3team-threadToolContextEvictionReactor.ts";
import {
  T3TeamProjectSourceIconReactor,
  T3TeamProjectSourceIconReactorLive,
} from "./t3team-projectSourceIconReactor.ts";
import {
  t3teamAtlassianAccountsRouteLayer,
  t3teamAtlassianAssetRouteLayer,
  t3teamAtlassianAssetContentRouteLayer,
  t3teamAtlassianBacklogRouteLayer,
  t3teamAtlassianConnectBasicRouteLayer,
  t3teamAtlassianConnectOAuthRouteLayer,
  t3teamAtlassianMyWorkRouteLayer,
  t3teamAtlassianProjectIssuesRouteLayer,
  t3teamAtlassianProjectsRouteLayer,
  t3teamAtlassianResourceRouteLayer,
  t3teamAtlassianResourcesRouteLayer,
} from "./t3team-atlassian-routes.ts";
import { t3teamAtlassianIssueContentRouteLayer } from "./t3team-atlassian-issue-content-routes.ts";
import { t3teamAtlassianOAuthExchangeRouteLayer } from "./t3team-atlassian-oauth-routes.ts";
import {
  t3teamAtlassianOAuthBeginRouteLayer,
  t3teamAtlassianOAuthCallbackRouteLayer,
} from "./t3team-atlassian-oauth-flowRoutes.ts";
import { t3teamRouteAuthLayer } from "./t3team-routeAuth.ts";
import { t3teamTempoRouteLayer } from "./t3team-tempo-routes.ts";
import { t3teamCloudBrokerRouteLayer } from "./t3team-cloud-broker-routes.ts";
import { t3teamAccountRouteLayer } from "./t3team-account-routes.ts";
import { t3teamProjectWorkspaceDiscoverRecipesRouteLayer } from "./t3team-project-workspace-recipe-routes.ts";
import { t3teamProjectWorkspaceWriteContextFilesRouteLayer } from "./t3team-project-workspace-write-routes.ts";
import {
  t3teamProjectWorkspaceRefreshProjectContextRouteLayer,
  t3teamProjectWorkspaceRefreshWorkItemContextRouteLayer,
  t3teamProjectWorkspaceRefreshWorkItemSliceContextRouteLayer,
} from "./t3team-context-refresh-routes.ts";
import {
  t3teamThreadRecipeWorkflowLaunchRouteLayer,
  t3teamThreadWorkflowResolveInputRouteLayer,
} from "./t3team-thread-recipe-workflow-routes.ts";
import { t3teamThreadDraftMutationStatusRouteLayer } from "./t3team-thread-draftMutation-status-route.ts";
import { t3teamThreadJobsRouteLayer } from "./t3team-thread-jobs-route.ts";
import { t3teamThreadWorkflowControlRouteLayer } from "./t3team-thread-workflow-control-route.ts";
import { ResourcePressureMonitorLive } from "./t3team-resourcePressureMonitor.ts";
import {
  t3teamGitHubAssetRouteLayer,
  t3teamGitHubInboxRouteLayer,
  t3teamGitHubPullRequestContextRouteLayer,
} from "./t3team-github-routes.ts";
import { t3teamProjectWorkspaceBootstrapRouteLayer } from "./t3team-project-repository-routes.ts";
import { t3teamProjectMainRepositoryRouteLayer } from "./t3team-projectMainRepositoryRoute.ts";
import { t3teamThreadToolContextRouteLayer } from "./t3team-thread-tool-context-routes.ts";
import { t3teamThreadPlacementRouteLayer } from "./t3team-thread-placement-routes.ts";
import { t3teamMyWorkDigestRouteLayer } from "./t3team-myworkDigest-routes.ts";
import { T3TeamThreadToolContextStoreLive } from "./t3team-threadToolContextStore.ts";
import { turnInactivityPolicyLive } from "./orchestration-v2/t3team-turnInactivityPolicy.ts";
import { packCompletionWakeRendererLive } from "./t3team-pack-completionWakeRenderer.ts";
import { t3teamWidgetToolCallRouteLayer } from "./t3team-widget-tool-call-route.ts";
import { T3TeamWidgetRegistryLive } from "./t3team-widgetRegistry.ts";
import { T3TeamContextRefreshServiceLive } from "./t3team-contextRefreshService.ts";
import { T3TeamWorkflowEngineReactorLive } from "./t3team-workflowEngineReactor.ts";
import { T3TeamActorMessageReactorLive } from "./t3team-actorMessageReactor.ts";
import { T3TeamActorMailboxStoreLive } from "./t3team-actorMailbox.ts";
import { T3TeamActorMailboxLive } from "./t3team-actorMailboxService.ts";
import { T3TeamProjectSourceBindingsLive } from "./t3team-projectSourceBindings.ts";
import {
  T3TeamMailboxDrainPortLive,
  T3TeamThreadMailboxDeliveryLive,
} from "./t3team-actorMailboxPorts.ts";
import { T3TeamThreadEngagementLive } from "./t3team-threadEngagement.ts";
import { T3TeamChildStatusReactorLive } from "./t3team-childStatusReactor.ts";
import { T3TeamActivityLabelReactorLive } from "./t3team-activityLabelReactor.ts";
import { T3TeamChildSettleSweeperLive } from "./t3team-childSettleSweeper.ts";
import { StandbyInterestLive } from "./cloud/t3team-StandbyInterest.ts";
import { layer as CloudSessionMachinesLayer } from "./cloud/t3team-CloudSessionMachine.ts";
import { layer as ProjectMachineDiscoveryLayer } from "./project/t3team-ProjectMachineDiscovery.ts";
import { T3TeamSettleGuardsLive } from "./t3team-childSettleGuards.ts";
import { T3TeamThreadTransientTurnRetryLive } from "./t3team-threadTransientTurnRetry.ts";
import {
  T3TeamSilenceWatchPortLive,
  T3TeamThreadSilenceWatchReactorLive,
} from "./t3team-threadSilenceWatchReactorLive.ts";
import { T3TeamWorkflowEngineRehydrateLive } from "./t3team-workflowEngineRehydrate.ts";
import { T3TeamWorkflowSignalDeliveryLive } from "./t3team-workflowSignalDelivery.ts";
import { T3TeamWorkflowSignalReconcilerLive } from "./t3team-workflowSignalReconciler.ts";
import { T3TeamWorkflowEngineRegistryLive } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSchedulerSweepLive } from "./t3team-workflowSchedulerSweepLive.ts";
import { T3TeamToolBrokerLive } from "./t3team-toolBrokerLive.ts";
import { T3TeamV2FoundationLive } from "./t3team-v2/t3team-v2FoundationLive.ts";
import * as T3TeamWorkflowHost from "./t3team-workflowHost.ts";
import { T3TeamChildThreadMetadataLive } from "./t3team-childThreadMetadata.ts";
import { T3TeamAskUserWriterLive } from "./mcp/toolkits/t3team/t3team-askUserWriter.ts";
import { T3TeamDelegatedTaskPreparationLive } from "./t3team-delegateTaskPreparationLive.ts";
import * as NetService from "@t3tools/shared/Net";
import * as RelayClient from "@t3tools/shared/relayClient";
import { disableTailscaleServe, ensureTailscaleServe } from "@t3tools/tailscale";
import * as ServerActivation from "./serverActivation.ts";

// MCP handoff thread IDs include escaped provenance and can exceed find-my-way's
// 100-character default for one path segment.
const HTTP_ROUTER_CONFIG = {
  maxParamLength: 512,
} as const;

// Effect's default preemptive shutdown waits 20s before finalizing request scopes.
// T3's primary transport is long-lived WebSocket RPC, whose Effect scope finalizer
// already closes the websocket gracefully. Do not add an artificial drain before
// those finalizers get a chance to run.
const HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS = 0;
const ResourceAttributionLayerLive = ResourceAttribution.layer;
const ApplicationObservabilityLive = EventLoopMonitor.layer.pipe(
  Layer.provideMerge(ObservabilityLive),
  Layer.provideMerge(ResourceAttributionLayerLive),
);

const PtyAdapterLive = NodePtyAdapter.layer;

const ServerSettingsLayerLive = ServerSettings.layer.pipe(
  Layer.provide(ServerSecretStore.layer),
  Layer.provideMerge(SqlitePersistence.layerConfig),
);

const NativeTelemetryLayerLive = NativeTelemetryClient.layer.pipe(
  Layer.provide(ResourceMonitorBinary.layer),
);
const DesktopTelemetryReceiverLayerLive = DesktopTelemetryReceiver.layer.pipe(
  Layer.provideMerge(ServerSettingsLayerLive),
);

const ResourceTelemetryLayerLive = ResourceTelemetry.layer.pipe(
  Layer.provideMerge(NativeTelemetryLayerLive),
  Layer.provideMerge(DesktopTelemetryReceiverLayerLive),
);

const HostPowerMonitorLayerLive = HostPowerMonitor.layer.pipe(
  Layer.provide(DesktopTelemetryReceiverLayerLive),
);

// Reuses DesktopTelemetryReceiverLayerLive: a fresh receiver layer here
// would open a second reader on the desktop telemetry fd.
const DesktopAppUpdateLayerLive = DesktopAppUpdate.layer.pipe(
  Layer.provide(DesktopTelemetryReceiverLayerLive),
);

const BackgroundLayerLive = BackgroundPolicy.layer.pipe(
  Layer.provide(HostPowerMonitorLayerLive),
  Layer.provideMerge(ServerSettingsLayerLive),
);

const UsageLayerLive = UsageService.layer.pipe(Layer.provide(ServerSettingsLayerLive));

const ResourceDiagnosticsLayerLive = Layer.mergeAll(
  HostResources.layer,
  ResourceTelemetryLayerLive,
  ProcessDiagnostics.layer.pipe(Layer.provide(ResourceTelemetryLayerLive)),
  ProcessResourceMonitor.layer.pipe(Layer.provide(ResourceTelemetryLayerLive)),
  // Flag NEXI_FF_RESOURCE_PRESSURE: off = a constant "disabled" report, no fiber.
  ResourcePressureMonitorLive.pipe(
    Layer.provide(Layer.mergeAll(HostResources.layer, ResourceTelemetryLayerLive)),
  ),
);

const RelayClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return RelayClient.layerCloudflared({ baseDir: config.baseDir });
  }),
);

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return NodeHttpServer.layer(() => guardHttpResponseWriteErrors(NodeHttp.createServer()), {
      host: config.host ?? "127.0.0.1",
      port: config.port,
      gracefulShutdownTimeout: HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS,
      // Negotiate permessage-deflate with clients that offer it; clients
      // that don't still get uncompressed frames on their connection.
      // Context takeover stays enabled (ws default) so the compression
      // window is shared across frames — that also makes small frames cheap
      // to compress, so no size threshold is set (ws only honors
      // `threshold` when context takeover is disabled).
      websocket: { perMessageDeflate: true },
    });
  }),
);

const PlatformServicesLive = NodeServices.layer;

const PersistenceLayerLive = Layer.empty.pipe(Layer.provideMerge(SqlitePersistence.layerConfig));

const VcsDriverRegistryLayerLive = VcsDriverRegistry.layer.pipe(
  Layer.provide(VcsProjectConfig.layer),
);

const SourceControlProviderRegistryLayerLive = SourceControlProviderRegistry.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      AzureDevOpsCli.layer,
      BitbucketApi.layer,
      GitHubCli.layer,
      GitLabCli.layer,
      ForgejoCli.layer,
    ),
  ),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(VcsDriverRegistryLayerLive),
);

const RepositoryIdentityResolverLayerLive = Layer.effect(
  RepositoryIdentityResolver.RepositoryIdentityResolver,
  Effect.gen(function* () {
    const registry = yield* SourceControlProviderRegistry.SourceControlProviderRegistry;
    return yield* RepositoryIdentityResolver.make({
      refine: Effect.fn(function* (identity: RepositoryIdentity) {
        const remote = ForgejoCli.parseForgejoRemote(identity.locator.remoteUrl);
        if (
          !remote ||
          !identity.rootPath ||
          (identity.provider !== undefined &&
            identity.provider !== "unknown" &&
            identity.provider !== "forgejo")
        )
          return identity;
        const handle = yield* registry.resolveHandle({
          cwd: identity.rootPath,
          context: {
            provider: { kind: "unknown", name: "Unknown", baseUrl: "" },
            remoteName: identity.locator.remoteName,
            remoteUrl: identity.locator.remoteUrl,
          },
        });
        if (handle.context?.provider.kind !== "forgejo") return identity;
        const baseUrl = handle.context.provider.baseUrl.replace(/\/+$/, "");
        const basePath = new URL(baseUrl).pathname.replace(/^\/+|\/+$/g, "");
        const path =
          !remote.ssh && basePath && remote.path.startsWith(`${basePath}/`)
            ? remote.path.slice(basePath.length + 1)
            : remote.path;
        return { ...identity, provider: "forgejo", webUrl: `${baseUrl}/${path}` };
      }),
    });
  }),
).pipe(Layer.provide(SourceControlProviderRegistryLayerLive), Layer.provide(ProcessRunner.layer));

const PullRequestServiceLive = PullRequestService.layer.pipe(
  // One registry entry per supported host; the service only knows the registry.
  Layer.provide(PullRequestProviderRegistry.layer),
  // Where the viewed-file marks live for a host that keeps none of its own.
  Layer.provide(PullRequestFilesViewed.layer),
  Layer.provide(PullRequestReadCache.layer),
  Layer.provide(SourceControlProviderRegistryLayerLive),
  Layer.provide(SourceControlRateLimit.layer),
  Layer.provide(VcsProcess.layer),
  // t3team: project linked repositories are read from the workspace's .t3team context directory.
  Layer.provide(WorkspacePaths.layer),
);

const GitManagerLayerLive = GitManager.layer.pipe(
  // Per-project git settings resolve the acting thread's project.
  Layer.provide(Layer.merge(ProjectionStoreV2.layer, ProjectStore.layer)),
  Layer.provideMerge(ProjectSetupScriptRunnerLayerLive),
  Layer.provideMerge(WorktreeSetupTracker.layer),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(SourceControlProviderRegistryLayerLive),
  Layer.provideMerge(
    TextGeneration.layer.pipe(Layer.provide(SourceControlProviderRegistryLayerLive)),
  ),
);

const GitLayerLive = Layer.empty.pipe(
  Layer.provideMerge(GitManagerLayerLive),
  Layer.provideMerge(GitVcsDriver.layer),
);

const GitWorkflowLayerLive = GitWorkflowService.layer.pipe(
  Layer.provideMerge(VcsDriverRegistryLayerLive),
  Layer.provideMerge(GitLayerLive),
);

const SourceControlRepositoryServiceLayerLive = SourceControlRepositoryService.layer.pipe(
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(SourceControlProviderRegistryLayerLive),
);

const ProjectCloneTrackerLayerLive = ProjectCloneTracker.layer.pipe(
  Layer.provide(SourceControlRepositoryServiceLayerLive),
);

const ReviewLayerLive = ReviewService.layer.pipe(
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(VcsDriverRegistryLayerLive),
);

const VcsLayerLive = Layer.empty.pipe(
  Layer.provideMerge(VcsProjectConfig.layer),
  Layer.provideMerge(VcsDriverRegistryLayerLive),
  Layer.provideMerge(VcsProvisioningService.layer.pipe(Layer.provide(VcsDriverRegistryLayerLive))),
  Layer.provideMerge(GitWorkflowLayerLive),
  Layer.provideMerge(ReviewLayerLive),
  Layer.provideMerge(SourceControlRepositoryServiceLayerLive),
  Layer.provideMerge(ProjectCloneTrackerLayerLive),
  Layer.provideMerge(
    VcsStatusBroadcaster.layer.pipe(
      Layer.provide(GitWorkflowLayerLive),
      // Auto-pull reads the project row. The orchestration runtime also
      // consumes the broadcaster (run finalization), so the policy cannot read
      // the store from the runtime's output.
      Layer.provide(
        VcsStatusBroadcaster.autoPullPolicyLayer.pipe(Layer.provide(ProjectStore.layer)),
      ),
    ),
  ),
);

const CheckpointStoreLayerLive = CheckpointStore.layer.pipe(
  Layer.provide(VcsDriverRegistryLayerLive),
);

const PortScannerLayerLive = PortScanner.layer.pipe(Layer.provide(ProcessRunner.layer));

const TerminalLayerLive = TerminalManager.layer.pipe(
  Layer.provide(PtyAdapterLive),
  Layer.provide(PortScannerLayerLive),
  Layer.provide(NativeTelemetryLayerLive),
);

// "Connected tools" sign-in flows. Reuses the same real pty service the
// terminal does — see apps/server/src/toolauth/t3team-ToolAuthService.ts.
const ToolAuthLayerLive = ToolAuthService.layer.pipe(Layer.provide(PtyAdapterLive));

const PreviewLayerLive = Layer.empty.pipe(
  Layer.provideMerge(PreviewManager.layer),
  Layer.provideMerge(PortScannerLayerLive),
);

const DeviceLayerLive = DeviceService.layer.pipe(
  Layer.provide(ServerSettingsLayerLive),
  Layer.provide(ProcessRunner.layer),
  Layer.provide(NetService.layer),
);

const WorkspaceEntriesLayerLive = WorkspaceEntries.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provideMerge(VcsDriverRegistryLayerLive),
);

const WorkspaceFileSystemLayerLive = WorkspaceFileSystem.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provide(WorkspaceEntriesLayerLive),
);

const WorkspaceLayerLive = Layer.mergeAll(
  WorkspacePaths.layer,
  WorkspaceEntriesLayerLive,
  WorkspaceFileSystemLayerLive,
);

const ProjectFaviconResolverLayerLive = ProjectFaviconResolver.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provide(T3ProjectFileLoader.layer),
);

const ServerEnvironmentLayerLive = ServerEnvironment.layer.pipe(
  Layer.provide(ServerSecretStore.layer),
);

const AuthLayerLive = EnvironmentAuth.layer.pipe(
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provide(ServerEnvironmentLayerLive),
  Layer.provide(ServerSecretStore.layer),
);

const CloudManagedEndpointRuntimeLive = Layer.mergeAll(
  RelayClientLive,
  CloudManagedEndpointRuntime.layer.pipe(
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(RelayClientLive),
  ),
);

// The workflow-engine singletons share one provideMerge slot (the `pipe` arity is capped):
// the in-memory run registry (reactor's hot index) + the durable run record + the SQLite
// journal store. Repo + store get the memoized SqlClient from PersistenceLayerLive (Epic 25
// §Open question 2); the registry needs nothing. The scheduler's wake gate (Epic 27) is layered
// on top; its sweep (`T3TeamWorkflowSchedulerSweepLive`, mounted with the workflow reactor)
// resolves runs from the one registry and reads the sleeping set from the one repo.
const WorkflowEngineDurabilityLive = T3TeamWorkflowSchedulerLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      T3TeamWorkflowEngineRegistryLive,
      WorkflowRunRepositoryLive,
      WorkflowJournalStoreLive,
    ),
  ),
  Layer.provide(PersistenceLayerLive),
);

export const mountT3TeamBrokerBeforeRuntimeServices = <A, E, R, A2, E2, R2>(
  runtimeHead: Layer.Layer<A, E, R>,
  brokerLayer: Layer.Layer<A2, E2, R2>,
) => runtimeHead.pipe(Layer.provideMerge(brokerLayer));

// Durable signal sources (GHE #332): the signal store (durable state), the delivery port
// (event → parked runs / inbox), and the reconciler (the live source set, derived from the
// journaled registrations). Chained provideMerge in DEPENDENCY ORDER — in `a.pipe(provideMerge(b))`
// the inner accumulated layer's requirements are satisfied by b's services while b's own
// requirements leak outward, so the reconciler (the fullest consumer) sits innermost and each
// outer step supplies what the accumulated layer still needs. Boot rehydration must finish
// before the boot reconcile starts source instances (GHE #332 review); the rehydrate layer runs
// with the workflow host at the app level, and the reconciler waits for it on the shared
// rehydrate gate rather than through a layer edge (which would pull the host in here).
const WorkflowSignalSourcesLive = T3TeamWorkflowSignalReconcilerLive.pipe(
  Layer.provideMerge(T3TeamWorkflowSignalDeliveryLive),
  Layer.provideMerge(WorkflowSignalStoreLive),
  Layer.provideMerge(WorkflowEngineDurabilityLive),
);

// t3team reactors started the way upstream starts its own workers (one effectDiscard layer per
// reactor). On V1 their start() calls lived in serverRuntimeStartup.
const T3TeamThreadToolContextEvictionReactorStartLive = Layer.effectDiscard(
  Effect.flatMap(T3TeamThreadToolContextEvictionReactor, (reactor) =>
    ServerActivation.forkParked(reactor.start()),
  ),
).pipe(Layer.provideMerge(T3TeamThreadToolContextEvictionReactorLive));

// Initial sync of work-source avatars for source-bound projects without an icon, plus live
// reaction to new bindings. Downloads run on its worker, never in the command-decide path.
const T3TeamProjectSourceIconReactorStartLive = Layer.effectDiscard(
  Effect.flatMap(T3TeamProjectSourceIconReactor, (reactor) =>
    ServerActivation.forkParked(reactor.start()),
  ),
).pipe(Layer.provideMerge(T3TeamProjectSourceIconReactorLive));

// The workflow engine's port onto V2. One const so the broker and the runtime head below share a
// single instance (layers memoize by reference).
const T3TeamWorkflowHostLive = T3TeamWorkflowHost.layer.pipe(Layer.provide(T3TeamV2FoundationLive));

// The fork MCP tool broker and the in-memory stores it shares with the routes/reactors.
const T3TeamToolBrokerLayerLive = T3TeamToolBrokerLive.pipe(
  Layer.provideMerge(T3TeamThreadToolContextStoreLive),
  Layer.provideMerge(T3TeamWidgetRegistryLive),
  Layer.provideMerge(T3TeamContextRefreshServiceLive),
  Layer.provide(WorkflowSignalSourcesLive),
  // The broker mounts beneath the runtime head, so the V2 orchestration tools only see the host
  // (`serviceOption` at construction) when it is provided to the broker itself.
  Layer.provide(T3TeamWorkflowHostLive),
  Layer.provide(ProviderRegistryLive),
  // The broker reads thread facts; same layer reference as the runtime registers (memoized).
  Layer.provide(T3TeamV2FoundationLive),
  // t3team: inter-agent mailbox — `children op:"drain"` port (shared instance, same reference
  // as the runtime registers) and the store `read_message` reads full bodies from.
  Layer.provide(T3TeamMailboxDrainPortLive),
  // t3team: `children op:"watch"/"unwatch"` port of the ONE silence watch (same layer reference
  // as the reactor mounted with the app layer).
  Layer.provide(T3TeamSilenceWatchPortLive),
  Layer.provide(T3TeamActorMailboxStoreLive),
  // t3team: `t3team.mywork.*` run the digest loader, which reads runs, child-thread metadata and
  // pull requests; they are in the runtime head, which the broker does not see (same references).
  Layer.provide(WorkflowRunRepositoryLive),
  Layer.provide(T3TeamChildThreadMetadataLive),
  Layer.provide(PullRequestServiceLive),
);

const OrchestrationV2RuntimeLayerLive = OrchestrationV2ProductionLayerLive.pipe(
  // t3team: host turn-inactivity watchdog budget per provider instance.
  Layer.provide(turnInactivityPolicyLive),
  // t3team: the ONE settle-guard override (workflow run, live child, parent wait, settled
  // parent); other fork guards compose into it (t3team-childSettleGuards.ts).
  Layer.provide(T3TeamSettleGuardsLive),
  // t3team: pack-registered delegated-completion wake text (default text without a pack).
  Layer.provide(packCompletionWakeRendererLive.pipe(Layer.provide(ProjectionStoreV2.layer))),
  Layer.provide(ProviderEventIngestor.analyticsLive),
  Layer.provide(CheckpointStoreLayerLive),
  Layer.provide(GitWorkflowLayerLive),
  Layer.provide(ResourceCleanupService.live),
  Layer.provide(
    RunFinalizationService.observerLive.pipe(
      Layer.provide(ProjectionStoreV2.layer),
      Layer.provide(PullRequestServiceLive),
      Layer.provide(ProjectServiceLayerLive),
    ),
  ),
);

const OrchestrationApplicationLayerLive = CheckpointDiffQuery.layer.pipe(
  Layer.provideMerge(CheckpointStoreLayerLive),
  Layer.provideMerge(OrchestrationV2RuntimeLayerLive),
);

// Automatic thread settlement (#8600): a server-owned sweep evaluates
// inactivity and merged pull requests, then settles through the orchestrator
// so every client sees the same shelf.
const ThreadSettlementWorkerLive = Layer.effectDiscard(
  ThreadSettlementService.make.pipe(Effect.flatMap((service) => service.start())),
).pipe(
  Layer.provide(PullRequestServiceLive),
  Layer.provide(ProjectionStoreV2.layer),
  // t3team: the sweep skips what the settle guards refuse (same layer reference as the runtime's).
  Layer.provide(T3TeamSettleGuardsLive),
);

const ThreadPullRequestWorkerLive = Layer.effectDiscard(
  ThreadPullRequestService.make.pipe(Effect.flatMap((service) => service.start())),
).pipe(Layer.provide(PullRequestServiceLive));

const ProviderInstallationRefreshLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const antigravity = yield* AntigravityInstallation.AntigravityInstallation;
    const codex = yield* CodexInstallation.CodexInstallation;
    const instances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    const providers = yield* ProviderRegistry.ProviderRegistry;
    yield* Stream.merge(
      antigravity.changes.pipe(
        Stream.changesWith((a, b) => a.installedVersion === b.installedVersion),
        Stream.drop(1),
      ),
      codex.changes.pipe(
        Stream.changesWith((a, b) => a.installedVersion === b.installedVersion),
        Stream.drop(1),
      ),
    ).pipe(
      Stream.runForEach((state) =>
        instances.listInstances.pipe(
          Effect.flatMap((entries) =>
            Effect.forEach(
              entries.filter((instance) => instance.driverKind === state.driver),
              (instance) => providers.refreshInstance(instance.instanceId),
              { discard: true },
            ),
          ),
        ),
      ),
      Effect.forkScoped,
    );
  }),
);

const RuntimeCoreDependenciesBaseLive = Layer.mergeAll(
  AgentAwarenessRelay.layer,
  ThreadSettlementWorkerLive,
  // t3team: the cleanup service is also exposed (provideMerge) for the resource-pressure
  // "sweep now" RPC; upstream only starts it.
  Layer.effectDiscard(
    Effect.flatMap(StorageCleanup.StorageCleanup, (service) => service.start()),
  ).pipe(Layer.provideMerge(StorageCleanup.layer), Layer.provide(ProjectionStoreV2.layer)),
  ThreadPullRequestWorkerLive,
  Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* PullRequestSyncReactor.PullRequestSyncReactor;
      yield* service.start();
    }),
  ).pipe(
    Layer.provideMerge(PullRequestSyncReactor.layer),
    Layer.provide(PullRequestServiceLive),
    Layer.provide(ProjectionStoreV2.layer),
  ),
  // Subscribes to `account.rate-limits.updated` so usage bars track live
  // telemetry instead of waiting for the next status probe.
  ProviderUsageLimitsIngestionLive,
  ProviderInstallationRefreshLive,
  ReplayMarkers.layer,
  T3TeamThreadToolContextEvictionReactorStartLive,
  T3TeamProjectSourceIconReactorStartLive,
  // t3team: the ONE project-mutation source hook (binding table + keyed claim lock, critic C13).
  T3TeamProjectSourceBindingsLive,
  // t3team: shared V2 foundation (facts/artifacts side stores, run-less message + lineage writers).
  T3TeamV2FoundationLive,
  // t3team: delegated-child ticket/placement store (delegate_task extension, placement readers).
  T3TeamChildThreadMetadataLive,
  // t3team: t3_ask_user questions as V2 message-capability runtime requests.
  T3TeamAskUserWriterLive,
  // t3team: the process's ONE inter-agent mailbox (durable store + delivery) and the composing
  // heartbeat it backs off on; ws.ts (noteComposing), the broker drain port and the
  // t3_thread_send mailbox hook resolve to these same instances (layer references memoize).
  T3TeamThreadEngagementLive,
  T3TeamActorMailboxLive,
  // t3team: the workflow engine's port onto V2 (threads, turns, notes, step pips, run facts),
  // over the same foundation writers (layer references memoize).
  T3TeamWorkflowHostLive,
).pipe(
  // t3team: the tool broker reads several capabilities through serviceOption at construction
  // time. Mount it before the runtime services so the later provideMerges expose the production
  // singletons to it as well as to the reactors, rather than constructing a dependency-blind broker.
  (runtimeHead) => mountT3TeamBrokerBeforeRuntimeServices(runtimeHead, T3TeamToolBrokerLayerLive),
  // Core Services
  Layer.provideMerge(OrchestrationApplicationLayerLive),
  Layer.provideMerge(OrchestrationEventInfrastructureLayerLive),
  Layer.provideMerge(Layer.merge(ProjectStore.layer, ThreadSearch.layer)),
  Layer.provideMerge(ServerSettingsLayerLive),
  // Signal sources (GHE #332): placed BEFORE the PullRequestService + Persistence provides
  // below — in `a.pipe(provideMerge(b))` the accumulated layer's requirements are satisfied
  // by b at this step only, so the signal chain's external {PullRequestService, SqlClient}
  // must be satisfied by a LATER step: PRS by the mergeAll below, SqlClient by PersistenceLayerLive.
  Layer.provideMerge(WorkflowSignalSourcesLive),
  // The asset route uses the registry's GitHub credential for private PR media.
  // t3team: PullRequestService is also exposed here (same memoized instance every consumer is
  // given) for the signal sources and the fork routes/tools that read pull requests.
  Layer.provideMerge(
    Layer.mergeAll(SourceControlProviderRegistryLayerLive, GitHubCli.layer, PullRequestServiceLive),
  ),
  // t3team: PullRequestService reads ProjectService, which the OrchestrationApplication step above
  // cannot hand to a later step; the runtime's own layer reference memoizes to that instance.
  Layer.provideMerge(ProjectServiceLayerLive),
  Layer.provideMerge(GitLayerLive),
  Layer.provideMerge(VcsLayerLive),
  Layer.provideMerge(
    Layer.mergeAll(TerminalLayerLive, PreviewLayerLive, DeviceLayerLive, ToolAuthLayerLive),
  ),
  Layer.provideMerge(PersistenceLayerLive),
  // Both read a user-owned file out of the state directory and stream changes
  // to clients; neither depends on the other.
  Layer.provideMerge(
    Layer.mergeAll(Keybindings.layer, EnvironmentTheme.layer, UsageLimitSources.layer),
  ),
  Layer.provideMerge(ProviderRegistryLive),
  // The instance registry is the new routing keystone — text generation,
  // adapter lookup, and runtime ingestion all resolve `ProviderInstanceId`
  // through this layer. Built-in drivers come from `BUILT_IN_DRIVERS`;
  // `providerInstances` hydration merges `settings.providers.<kind>`
  // with explicit `providerInstances` entries on boot.
  Layer.provideMerge(ProviderInstanceRegistryHydrationLive),
  Layer.provideMerge(
    Layer.mergeAll(
      AntigravityInstallation.AntigravityInstallation.layer,
      CodexInstallation.CodexInstallation.layer,
    ),
  ),
);

const RuntimeCoreDependenciesLive = RuntimeCoreDependenciesBaseLive.pipe(
  Layer.provideMerge(PtyAdapterLive),
  // Search, prepare, status inspection, and turn launch share one registry
  // cache so every client and provider instance sees the same prepared agents.
  Layer.provideMerge(AcpRegistryCatalogLive),
  // Shared native/canonical NDJSON writers used by both the per-instance
  // V2 drivers and the orchestration runtime. Provide resource attribution so
  // the rewritten telemetry pipeline can account for logical NDJSON writes.
  // Provided once at the runtime level so every consumer sees the same
  // logger instances.
  // `ModelManifest.layer` is the legacy-model classification data, refreshed
  // from the repo's `model-manifest.json` on `main` and applied by the
  // Codex/Claude drivers.
  Layer.provideMerge(
    Layer.mergeAll(ProviderEventLoggers.layer, ModelManifest.layer, ResetCreditCoordinator.layer),
  ),
  // `OpenCodeDriver.create()` yields `OpenCodeRuntime`; previously the old
  // `ProviderRegistryLive` pulled `OpenCodeRuntimeLive` in for itself, but
  // the rewritten registry reads snapshots off the instance registry and
  // no longer transitively provides it. Exposing it at the runtime level
  // keeps a single Live for all opencode consumers.
  Layer.provideMerge(
    OpenCodeRuntime.OpenCodeRuntimeLive.pipe(Layer.provide(OpenCodeServerLedger.layer)),
  ),
  Layer.provideMerge(WorkspaceLayerLive),
  Layer.provideMerge(ProjectEnrichmentService.layer),
  Layer.provideMerge(Layer.mergeAll(NativeAppIconResolver.layer, ProjectFaviconResolverLayerLive)),
  Layer.provideMerge(RepositoryIdentityResolverLayerLive),
  Layer.provideMerge(ServerEnvironmentLayerLive),
  Layer.provideMerge(AuthLayerLive),
  Layer.provideMerge(ServerSecretStore.layer),
  Layer.provideMerge(
    Layer.mergeAll(
      CloudCliTokenManager.layer.pipe(
        Layer.provide(ServerSecretStore.layer),
        Layer.provide(ExternalLauncher.layer),
      ),
      // The in-app credential mint rides the SAME CloudCliTokenManager and
      // ExternalLauncher instances the CLI flow uses, so minted and CLI
      // credentials land in one shared secret.
      ConnectCredentialMinter.layer,
      // Server-lifetime, not per connection: an account sign-in in flight and the loopback
      // forwarders of attached broker sessions are shared by the RPCs and the HTTP routes.
      NexiBrokerService.layer.pipe(
        Layer.provideMerge(
          Accounts.layer.pipe(
            Layer.provide(ServerSecretStore.layer),
            Layer.provide(ExternalLauncher.layer),
          ),
        ),
      ),
      CloudManagedEndpointRuntimeLive,
    ),
  ),
);

const RuntimeDependenciesLive = RuntimeCoreDependenciesLive.pipe(
  // Misc.
  Layer.provideMerge(BackgroundLayerLive),
  Layer.provideMerge(ResourceDiagnosticsLayerLive),
  Layer.provideMerge(UsageLayerLive),
  Layer.provideMerge(TraceDiagnostics.layer),
  Layer.provideMerge(AnalyticsService.layer),
  Layer.provideMerge(ExternalLauncher.layer),
  Layer.provideMerge(RemoteOpenTargets.layer),
  Layer.provideMerge(ServerLifecycleEvents.layer),
  Layer.provide(NetService.layer),
);

const commandReadinessLayer = HttpRouter.middleware(
  (httpEffect) =>
    Effect.flatMap(ServerRuntimeStartup.ServerRuntimeStartup, (startup) =>
      startup.awaitCommandReady.pipe(Effect.orDie, Effect.andThen(httpEffect)),
    ),
  { global: true },
);

const makeRoutesLayer = Layer.mergeAll(
  Layer.mergeAll(
    HttpApiBuilder.layer(EnvironmentHttpApi).pipe(
      Layer.provide(authHttpApiLayer),
      Layer.provide(connectHttpApiLayer),
      Layer.provide(orchestrationHttpApiLayer),
      Layer.provide(pullRequestHttpApiLayer),
      Layer.provide(projectHttpApiLayer),
      Layer.provide(serverEnvironmentHttpApiLayer),
      Layer.provide(environmentAuthenticatedAuthLayer),
    ),
    otlpTracesProxyRouteLayer,
    assetRouteLayer,
    attachmentUploadRouteLayer,
    deviceHubProxyRouteLayer,
    staticAndDevRouteLayer,
    websocketRpcRouteLayer,
  ),
  // t3team routes. This is now the ONLY route registry: the parallel `makeT3TeamRoutesLayer`
  // in `t3team-server.ts` was deleted in the 2026-08 upstream sync, since the two copies drifted
  // every time upstream moved. The `t3team` binary launches this same layer (cli/t3team-server.ts).
  // Routes that carry their own capability (t3team-routeAuth.ts says why each one may).
  Layer.mergeAll(
    t3teamAtlassianAssetContentRouteLayer,
    t3teamAtlassianOAuthCallbackRouteLayer,
    t3teamCloudBrokerRouteLayer,
    t3teamAccountRouteLayer,
  ),
  // Every other t3team route requires a session, like upstream's raw routes (t3team-routeAuth.ts).
  Layer.mergeAll(
    t3teamAtlassianAccountsRouteLayer,
    t3teamAtlassianAssetRouteLayer,
    t3teamAtlassianBacklogRouteLayer,
    t3teamAtlassianConnectBasicRouteLayer,
    t3teamAtlassianConnectOAuthRouteLayer,
    t3teamAtlassianIssueContentRouteLayer,
    t3teamAtlassianMyWorkRouteLayer,
    t3teamAtlassianOAuthBeginRouteLayer,
    t3teamAtlassianOAuthExchangeRouteLayer,
    t3teamAtlassianProjectIssuesRouteLayer,
    t3teamAtlassianProjectsRouteLayer,
    t3teamAtlassianResourceRouteLayer,
    t3teamAtlassianResourcesRouteLayer,
    t3teamTempoRouteLayer,
  ).pipe(Layer.provide(t3teamRouteAuthLayer)),
  Layer.mergeAll(
    t3teamGitHubAssetRouteLayer,
    t3teamGitHubInboxRouteLayer,
    t3teamGitHubPullRequestContextRouteLayer,
    t3teamProjectWorkspaceBootstrapRouteLayer,
    t3teamProjectMainRepositoryRouteLayer,
    t3teamProjectWorkspaceDiscoverRecipesRouteLayer,
    t3teamProjectWorkspaceWriteContextFilesRouteLayer,
    t3teamProjectWorkspaceRefreshProjectContextRouteLayer,
    t3teamProjectWorkspaceRefreshWorkItemContextRouteLayer,
    t3teamProjectWorkspaceRefreshWorkItemSliceContextRouteLayer,
    t3teamThreadRecipeWorkflowLaunchRouteLayer,
    t3teamThreadWorkflowControlRouteLayer,
    t3teamThreadJobsRouteLayer,
    t3teamThreadDraftMutationStatusRouteLayer,
    t3teamThreadWorkflowResolveInputRouteLayer,
    t3teamThreadToolContextRouteLayer,
    t3teamThreadPlacementRouteLayer,
    t3teamMyWorkDigestRouteLayer,
    t3teamWidgetToolCallRouteLayer,
  ).pipe(Layer.provide(t3teamRouteAuthLayer)),
  // The MCP session registry is provided globally (shared with V2 provider
  // sessions) rather than inline here. The orchestrator toolkit resolves
  // delegation targets through the same live adapter facade the V2
  // orchestrator uses, so MCP capability reporting can never drift from
  // what dispatch can actually serve.
  McpHttpServer.layer.pipe(
    Layer.provide(ProviderAdapterRegistry.layerFromProviderInstanceRegistry),
    // t3team: delegate_task workspace isolation + extensions (DelegatedTaskPreparation hook).
    Layer.provide(T3TeamDelegatedTaskPreparationLive),
    // t3team: t3_thread_send mode "mailbox" (shared inter-agent mailbox instance).
    Layer.provide(T3TeamThreadMailboxDeliveryLive),
  ),
  // Last, so no route layer can replace the server's one TracerDisabledWhen.
  untracedRequestsLayer,
).pipe(
  // Both transports consume the same service instance, so caches single-flight across clients
  // and mutations observed on WebSocket invalidate patches subsequently read over HTTP.
  Layer.provide(PullRequestServiceLive),
  Layer.provide(PreviewAutomationBroker.layer),
  Layer.provide(ServerSelfUpdate.layer.pipe(Layer.provide(DesktopAppUpdateLayerLive))),
  Layer.provide(commandReadinessLayer),
  Layer.provide(browserApiCorsLayer),
  Layer.provide(httpCompressionLayer),
);

class ServerDistributionActivationError extends Schema.TaggedError<ServerDistributionActivationError>()(
  "ServerDistributionActivationError",
  { cause: Schema.Unknown },
) {
  override get message(): string {
    return `Compiled-in distribution activation failed: ${String(this.cause)}`;
  }
}

const makeServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const activation = yield* Deferred.make<void>();
    const awaitActivation = Deferred.await(activation);
    const activationLayer = Layer.succeed(ServerActivation.ServerActivation, awaitActivation);
    const runtimeStateParked = yield* Deferred.make<void>();
    const tailscaleParked = yield* Deferred.make<void>();
    const cloudLinkParked = yield* Deferred.make<void>();
    const routesReady = yield* Deferred.make<void>();
    const launcherLayer = ServiceLauncherClient.layer;

    yield* fixPath();

    // Activate the compiled-in distribution before any layers are built so the
    // appearance, branding, and provider overlays are available to
    // ServerEnvironment and every other service. The t3team binary does this
    // in t3team-server.ts; the standard start/serve path needs it too.
    yield* Effect.tryPromise({
      try: () => activateCompiledInDistribution(),
      catch: (cause) => new ServerDistributionActivationError({ cause }),
    }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("Compiled-in distribution activation failed; continuing without it", {
          cause,
        }),
      ),
    );

    const httpListeningLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* HttpServer.HttpServer;
        const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
        yield* startup.markHttpListening;
      }),
    );
    const runtimeStateLayer = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.gen(function* () {
          yield* Deferred.succeed(runtimeStateParked, undefined).pipe(Effect.orDie);
          yield* awaitActivation;
          const server = yield* HttpServer.HttpServer;
          const address = server.address;
          if (typeof address === "string" || !("port" in address)) {
            return;
          }

          const launcher = yield* ServiceLauncherClient.ServiceLauncherClient;
          const state = yield* makePersistedServerRuntimeState({
            config,
            port: address.port,
            serviceManaged: launcher.managed,
          });
          yield* persistServerRuntimeState({
            path: config.serverRuntimeStatePath,
            state,
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to persist server runtime state", { cause }),
            ),
          );
        }),
        () =>
          clearPersistedServerRuntimeState(config.serverRuntimeStatePath).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to clear server runtime state", { cause }),
            ),
          ),
      ),
    );
    const tailscaleServeLayer = config.tailscaleServeEnabled
      ? Layer.effectDiscard(
          Effect.acquireRelease(
            Effect.gen(function* () {
              yield* Deferred.succeed(tailscaleParked, undefined).pipe(Effect.orDie);
              yield* awaitActivation;
              const server = yield* HttpServer.HttpServer;
              const address = server.address;
              if (typeof address === "string" || !("port" in address)) {
                return null;
              }

              const localPort = address.port;
              return yield* ensureTailscaleServe({
                localPort,
                servePort: config.tailscaleServePort,
                localHost: "127.0.0.1",
              }).pipe(
                Effect.as({ localPort, servePort: config.tailscaleServePort }),
                Effect.tap(() =>
                  Effect.logInfo("Tailscale Serve configured", {
                    localPort,
                    servePort: config.tailscaleServePort,
                  }),
                ),
                Effect.catch((cause) =>
                  Effect.logWarning("Failed to configure Tailscale Serve", {
                    cause,
                    localPort,
                    servePort: config.tailscaleServePort,
                  }).pipe(Effect.as(null)),
                ),
              );
            }),
            (configured) =>
              configured
                ? disableTailscaleServe({ servePort: configured.servePort }).pipe(
                    Effect.tap(() =>
                      Effect.logInfo("Tailscale Serve disabled", {
                        servePort: configured.servePort,
                      }),
                    ),
                    Effect.catch((cause) =>
                      Effect.logWarning("Failed to disable Tailscale Serve", {
                        cause,
                        servePort: configured.servePort,
                      }),
                    ),
                  )
                : Effect.void,
          ),
        )
      : Layer.empty;
    const cloudDesiredLinkReconcileLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        const releaseManagedTunnel = releaseManagedTunnelOnShutdown().pipe(
          Effect.timeout("10 seconds"),
          Effect.tap((released) =>
            released ? Effect.logInfo("Released the managed tunnel on shutdown") : Effect.void,
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning(
              "Failed to release the managed tunnel on shutdown; the next link reuses it",
              { errors: Cause.prettyErrors(cause).map((error) => error.message) },
            ),
          ),
          Effect.asVoid,
        );
        // A launcher trial can be stopped before activation. The previous
        // server is already gone, so the trial owns cleanup immediately; the
        // pending-state check keeps the tunnel for normal commit or rollback,
        // while the launcher's explicit-stop marker allows it to be released.
        // Other runtimes wait for activation so a failed standby cannot tear
        // down the active runtime's tunnel.
        const cleanupBeforeActivation = yield* pendingServiceUpdateExists;
        if (cleanupBeforeActivation) {
          yield* Effect.addFinalizer(() => releaseManagedTunnel);
        }
        yield* ServerActivation.forkParked(
          Effect.gen(function* () {
            if (!cleanupBeforeActivation) {
              yield* Effect.addFinalizer(() => releaseManagedTunnel);
            }
            const server = yield* HttpServer.HttpServer;
            const address = server.address;
            if (typeof address === "string" || !("port" in address)) return;
            const localOrigin = `http://127.0.0.1:${address.port}`;
            const endpointRuntime = yield* CloudManagedEndpointRuntime.CloudManagedEndpointRuntime;
            const recoveryLock = yield* Semaphore.make(1);
            let lastRecoveryAtMillis = 0;
            const recoverManagedTunnel = (config: RelayManagedEndpointRuntimeConfig) =>
              recoveryLock.withPermits(1)(
                Effect.gen(function* () {
                  const elapsed = (yield* Clock.currentTimeMillis) - lastRecoveryAtMillis;
                  const wait = Duration.toMillis(MANAGED_TUNNEL_RECOVERY_COOLDOWN) - elapsed;
                  if (wait > 0) yield* Effect.sleep(Duration.millis(wait));
                  lastRecoveryAtMillis = yield* Clock.currentTimeMillis;
                }).pipe(
                  Effect.andThen(
                    recoverManagedCloudTunnel(localOrigin, config, {
                      retryRuntimeFailures: true,
                    }),
                  ),
                  Effect.retry({
                    while: (error) =>
                      shouldRetryCloudLink(error) &&
                      error._tag !== "EnvironmentCloudEndpointUnavailableError",
                    schedule: Schedule.exponential("1 second").pipe(
                      Schedule.modifyDelay(({ duration }) =>
                        Effect.succeed(Duration.min(duration, Duration.seconds(30))),
                      ),
                      Schedule.jittered,
                    ),
                  }),
                  Effect.tap((recovered) =>
                    recovered ? Effect.logInfo("T3 Connect managed tunnel recovered") : Effect.void,
                  ),
                  Effect.catchCause((cause) =>
                    Cause.hasInterrupts(cause)
                      ? Effect.interrupt
                      : Effect.logWarning("Failed to recover the T3 Connect managed tunnel", {
                          cause,
                        }),
                  ),
                ),
              );
            yield* endpointRuntime.recoveryRequests.pipe(
              Stream.runForEach(recoverManagedTunnel),
              Effect.forkScoped,
            );
            // No settling delay before the first attempt: routes are already
            // serving by the time activation opens this gate (the startup
            // sequence awaits routesReady), and the retry schedule below
            // covers anything this sleep used to hedge against. Every
            // millisecond here is dead time on the path to remote
            // reachability after a restart.
            const wantsCliLink = hasCloudPublicConfig
              ? yield* CloudCliState.readCliDesiredCloudLink.pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("Failed to read the desired T3 Connect link", { cause }).pipe(
                      Effect.as(false),
                    ),
                  ),
                )
              : false;
            // A failed read must not end this fiber before it registers
            // recovery and starts consuming recovery requests. "managed" is
            // what a missing value means, so it is the safe fallback.
            const desiredCliLinkMode = wantsCliLink
              ? yield* CloudCliState.readCliDesiredLinkMode.pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("Failed to read the desired T3 Connect link mode", {
                      cause,
                    }).pipe(Effect.as("managed" as const)),
                  ),
                )
              : null;
            // A publish-only link must not expose the host, even if a managed
            // config from an earlier link is still stored.
            const startedConfirmed =
              desiredCliLinkMode === "publish_only"
                ? false
                : yield* startManagedCloudTunnelIfOriginConfirmed(localOrigin).pipe(
                    Effect.catch((cause) =>
                      Effect.logWarning("Failed to start the confirmed T3 Connect tunnel", {
                        cause,
                      }).pipe(Effect.as(false)),
                    ),
                  );
            const startStoredManagedTunnel = startManagedCloudTunnelIfOriginConfirmed(localOrigin, {
              requireConfirmedOrigin: false,
            }).pipe(
              Effect.tap((started) =>
                started
                  ? Effect.logWarning(
                      "T3 Connect started the stored tunnel without relay confirmation",
                    )
                  : Effect.void,
              ),
              Effect.catch((cause) =>
                Effect.logWarning("Failed to start the stored T3 Connect tunnel", { cause }),
              ),
              Effect.asVoid,
            );
            const registerManagedTunnel = retryManagedTunnelRegistration(
              registerManagedCloudTunnelRecovery(localOrigin, {
                retryRuntimeFailures: true,
              }),
              (error) =>
                shouldRetryCloudLink(error) &&
                error._tag !== "EnvironmentCloudEndpointUnavailableError",
              startedConfirmed ? Effect.void : startStoredManagedTunnel,
            ).pipe(
              Effect.tap((result) =>
                result.status === "ready"
                  ? Effect.logInfo("T3 Connect managed tunnel recovery registered")
                  : Effect.void,
              ),
              Effect.catchCause((cause) =>
                Cause.hasInterrupts(cause)
                  ? Effect.interrupt
                  : Effect.logWarning("Failed to register T3 Connect managed tunnel recovery", {
                      cause,
                    }).pipe(Effect.as({ status: "unavailable" as const })),
              ),
            );
            // A host without a confirmed marker is on its first boot after the
            // upgrade. Spread those registrations so an auto-update wave does
            // not hit the relay all at once.
            if (!startedConfirmed && desiredCliLinkMode !== "publish_only") {
              const jitter = yield* Random.nextIntBetween(
                0,
                Duration.toMillis(MANAGED_TUNNEL_FIRST_REGISTRATION_JITTER),
              );
              yield* Effect.sleep(Duration.millis(jitter));
            }
            const registration =
              desiredCliLinkMode === "publish_only"
                ? { status: "not_linked" as const }
                : yield* registerManagedTunnel;
            // A terminal registration failure also allows the stored config
            // to start. Transient outages use the fallback above and keep
            // registration retrying in this scoped startup fiber.
            if (registration.status === "unavailable" && !startedConfirmed) {
              yield* startStoredManagedTunnel;
            }
            const startupAction = managedTunnelStartupAction({ wantsCliLink, registration });
            if (startupAction.action === "request_recovery") {
              yield* endpointRuntime.requestRecovery(startupAction.config);
            }
            if (startupAction.action === "reconcile_link") {
              const reconciledMode = yield* reconcileDesiredCloudLinkIfStillDesired(
                localOrigin,
              ).pipe(
                Effect.retry({
                  while: shouldRetryCloudLink,
                  schedule: Schedule.exponential("1 second").pipe(
                    Schedule.modifyDelay(({ duration }) =>
                      Effect.succeed(Duration.min(duration, Duration.seconds(30))),
                    ),
                    Schedule.upTo({ duration: "10 minutes" }),
                  ),
                }),
                Effect.tap((mode) =>
                  mode === null
                    ? Effect.void
                    : Effect.logInfo("T3 Connect desired link reconciled on startup"),
                ),
                Effect.catch((cause) =>
                  Effect.logWarning("Failed to reconcile T3 Connect desired link on startup", {
                    cause,
                  }).pipe(Effect.as(null)),
                ),
              );
              if (reconciledMode === "managed") {
                const afterReconcile = yield* registerManagedTunnel;
                if (afterReconcile.status === "recovery_required") {
                  yield* endpointRuntime.requestRecovery(afterReconcile.config);
                }
              }
            }
          }),
        );
        // Top up the per-user T3 Connect credential in the background: a
        // linked environment (linked from the app or a phone) can outlive a
        // missing or unrefreshable credential, and the cloud-session handoff
        // needs one. The top-up may open the user's browser; it never blocks
        // activation, and not-linked installs never attempt a mint.
        yield* ServerActivation.forkParked(
          runConnectCredentialTopUp().pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Stopped the T3 Connect credential top-up", {
                errors: Cause.prettyErrors(cause).map((error) => error.message),
              }),
            ),
          ),
        );
        yield* Deferred.succeed(cloudLinkParked, undefined).pipe(Effect.orDie);
      }),
    );

    const runtimeServicesLive = ServerRuntimeStartup.layerWithOptions({
      activate: Deferred.succeed(activation, undefined).pipe(Effect.asVoid),
      abort: (error) => Deferred.die(activation, error).pipe(Effect.asVoid),
      awaitAuxiliaryParked: Effect.all(
        [
          Deferred.await(runtimeStateParked),
          Deferred.await(cloudLinkParked),
          Deferred.await(routesReady),
          ...(config.tailscaleServeEnabled ? [Deferred.await(tailscaleParked)] : []),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),
    }).pipe(Layer.provideMerge(RuntimeDependenciesLive), Layer.provide(launcherLayer));

    const routesLayer = HttpRouter.serve(makeRoutesLayer.pipe(Layer.provide(launcherLayer)), {
      disableLogger: !config.logWebSocketEvents,
      routerConfig: HTTP_ROUTER_CONFIG,
    }).pipe(Layer.tap(() => Deferred.succeed(routesReady, undefined).pipe(Effect.orDie)));
    const serverApplicationLayer = Layer.mergeAll(
      routesLayer,
      httpListeningLayer,
      runtimeStateLayer.pipe(Layer.provide(launcherLayer)),
      tailscaleServeLayer,
      T3TeamWorkflowEngineReactorLive,
      // t3team: the workflow scheduler's wake sweep (a `Scheduler` source); mounted here, not with
      // its gate, because an orphaned run's notice goes through the workflow host.
      T3TeamWorkflowSchedulerSweepLive,
      T3TeamActorMessageReactorLive,
      T3TeamChildStatusReactorLive,
      T3TeamActivityLabelReactorLive,
      T3TeamChildSettleSweeperLive,
      // t3team: tells the cloud-session broker which projects to keep warm machines for (#562).
      StandbyInterestLive.pipe(
        Layer.provide(
          CloudSessionMachinesLayer.pipe(
            Layer.provide(GitHubCli.layer),
            Layer.provide(ProjectMachineDiscoveryLayer),
          ),
        ),
      ),
      T3TeamThreadSilenceWatchReactorLive,
      T3TeamThreadTransientTurnRetryLive,
      T3TeamWorkflowEngineRehydrateLive,
      cloudDesiredLinkReconcileLayer,
      HeapSnapshot.layer,
    );

    return serverApplicationLayer.pipe(
      // loadPullRequestContext (behind t3teamGitHubPullRequestContextRouteLayer, inside
      // makeRoutesLayer) now requires PullRequestService directly. makeRoutesLayer already
      // provides PullRequestServiceLive to the routes merged there, but that provision does
      // not reach the requirement HttpRouter.serve's own effect carries at this outer level —
      // so it is provided again here, ahead of the rest of this pipe. The pr-context route's
      // own project resolver also reads PullRequestProviderRegistry directly, same story.
      Layer.provide(PullRequestServiceLive),
      Layer.provide(PullRequestProviderRegistry.layer),
      Layer.provideMerge(runtimeServicesLive),
      Layer.provideMerge(
        McpSessionRegistry.layer.pipe(
          Layer.provide(ServerEnvironment.layer.pipe(Layer.provide(ServerSecretStore.layer))),
        ),
      ),
      Layer.provide(activationLayer),
      Layer.provideMerge(serverRelayBrokerTracingLayer),
      Layer.provideMerge(HttpServerLive),
      Layer.provide(ApplicationObservabilityLive),
      Layer.provideMerge(FetchHttpClient.layer),
      // PR reads, Git operations, and WebSocket discovery share one process limiter.
      Layer.provide(VcsProcess.layer),
      Layer.provideMerge(PlatformServicesLive),
    );
  }),
);

// The CLI supplies configuration.
export const runServer = Layer.launch(makeServerLayer);
