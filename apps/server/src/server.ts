import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import type { RelayManagedEndpointRuntimeConfig } from "@t3tools/contracts/relay";
import * as Random from "effect/Random";
import * as DatabaseStorage from "./persistence/DatabaseStorage.ts";
import * as StorageCleanup from "./storageCleanup.ts";
import * as PullRequestSyncReactor from "./orchestration-v2/PullRequestSyncReactor.ts";
import * as PullRequestWatchReactor from "./orchestration-v2/PullRequestWatchReactor.ts";
import * as DelegatedTaskQuestionReactor from "./orchestration-v2/DelegatedTaskQuestionReactor.ts";
// Effect wraps this raw Node HTTP server after its startup and write-error guards attach.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeHttp from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentHttpApi, type RepositoryIdentity } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import { activateCompiledInDistribution } from "./t3team-distribution-bootstrap.ts";
import { activatePackRecipeSources } from "./t3team-packRecipeSourcesFromEnv.ts";
import { installProcessResilience } from "./t3team-processResilience.ts";

import * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import * as HostPowerMonitor from "./background/HostPowerMonitor.ts";
import * as ServerConfig from "./config.ts";
import { withUntracedRequests } from "./http.ts";
import * as ServerHttp from "./http.ts";
import {
  guardHttpResponseWriteErrors,
  rejectRequestsUntilServing,
} from "./httpResponseErrorGuard.ts";
import { fixPath } from "./os-jank.ts";
import * as Ws from "./ws.ts";
import * as AgentScopeLive from "./process/agentScope.ts";
import * as ExternalLauncher from "./process/externalLauncher.ts";
import * as PacedChildProcessSpawner from "./process/t3team-pacedChildProcessSpawner.ts";
import * as NodePtyAdapter from "./terminal/NodePtyAdapter.ts";
import * as PullRequestHttp from "./pullRequest/http.ts";
import * as PullRequestProviderRegistry from "./pullRequest/PullRequestProviderRegistry.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
import * as SqlitePersistence from "./persistence/Sqlite.ts";
import * as PullRequestFilesViewed from "./persistence/PullRequestFilesViewed.ts";
import * as PullRequestReviewGuides from "./persistence/PullRequestReviewGuides.ts";
import * as PullRequestReviewGuideService from "./pullRequest/PullRequestReviewGuideService.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as AnalyticsService from "./telemetry/AnalyticsService.ts";
import * as DelegatedTaskAnalytics from "./telemetry/DelegatedTaskAnalytics.ts";
import * as ProviderEventIngestor from "./orchestration-v2/ProviderEventIngestor.ts";
import * as ModelManifest from "./provider/ModelManifest.ts";
import * as ResetCreditCoordinator from "./provider/resetCreditCoordinator.ts";
import * as EventNdjsonLogger from "./provider/EventNdjsonLogger.ts";
import * as ProviderLatestVersions from "@t3tools/provider-core/server/ProviderLatestVersions";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as OpenCodeRuntime from "@t3tools/provider-opencode/server/OpenCodeRuntime";
import * as OpenCodeServerLedger from "@t3tools/provider-opencode/server/OpenCodeServerLedger";
import * as ProviderHostLive from "./provider/ProviderHostLive.ts";
import * as DocumentText from "./provider/DocumentText.ts";
import * as AcpRegistrySupport from "@t3tools/provider-acp-registry/server/AcpRegistrySupport";
import * as CheckpointDiffQuery from "./checkpointing/CheckpointDiffQuery.ts";
import * as CheckpointStore from "./checkpointing/CheckpointStore.ts";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as SourceControlBuiltInDrivers from "./sourceControl/builtInDrivers.ts";
import * as ServerSourceControlHost from "./sourceControl/ServerSourceControlHost.ts";
import * as SourceControlSignIn from "./sourceControl/SourceControlSignIn.ts";
import { BUILT_IN_SOURCE_CONTROL_DRIVER_LIST } from "./sourceControl/sourceControlDefinitions.ts";
import * as TextGeneration from "./textGeneration/TextGeneration.ts";
import * as ProviderInstanceRegistryHydration from "./provider/ProviderInstanceRegistryHydration.ts";
import { T3TeamRemoteEnvironmentLive } from "./t3team-remoteEnvironmentServices.ts";
import * as ProjectSettingsOverrideSweep from "./provider/ProjectSettingsOverrideSweep.ts";
import * as TerminalManager from "./terminal/Manager.ts";
import * as McpHttpServer from "./mcp/McpHttpServer.ts";
import * as PeerForwarding from "./peer/PeerForwarding.ts";
import * as RemoteDelegation from "./peer/RemoteDelegation.ts";
import * as PeerLinkRequests from "./peer/PeerLinkRequests.ts";
import * as PeerLinks from "./peer/PeerLinks.ts";
import * as PeerMcpClient from "./peer/PeerMcpClient.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "./mcp/PreviewAutomationBroker.ts";
import * as DeviceService from "./device/DeviceService.ts";
import * as DeviceHubProxy from "./device/DeviceHubProxy.ts";
import * as PreviewManager from "./preview/Manager.ts";
import * as PortScanner from "./preview/PortScanner.ts";
import * as ServerBrowser from "./preview/ServerBrowser.ts";
import * as PreviewAgentActivity from "./preview/PreviewAgentActivity.ts";
import * as DesktopBrowserChannel from "./preview/DesktopBrowserChannel.ts";
import * as ServerBrowserStream from "./preview/ServerBrowserStream.ts";
import * as PreviewBrowser from "./preview/PreviewBrowser.ts";
import * as ProcessRunner from "./processRunner.ts";
import * as GitManager from "./git/GitManager.ts";
import * as EnvironmentTheme from "./environmentTheme.ts";
import * as Keybindings from "./keybindings.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import * as ServerOwnership from "./serverOwnership.ts";
import * as AgentAwarenessRelay from "./relay/AgentAwarenessRelay.ts";
import { hasCloudPublicConfig } from "./cloud/publicConfig.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as ProjectEnrichmentService from "./project/ProjectEnrichmentService.ts";
import * as NativeAppIconResolver from "./assets/NativeAppIconResolver.ts";
import * as AntigravityInstallation from "./provider/AntigravityInstallation.ts";
import * as CodexInstallation from "./provider/CodexInstallation.ts";
import * as ProviderInstanceRegistry from "./provider/ProviderInstanceRegistry.ts";
import * as ProviderAdapterRegistry from "./orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderRegistry from "./provider/ProviderRegistry.ts";
import * as ProviderUsageLimitsIngestion from "./provider/ProviderUsageLimitsIngestion.ts";
import * as UsageLimitSources from "./usage/UsageLimitSources.ts";
import * as ProjectFaviconResolver from "./project/ProjectFaviconResolver.ts";
import * as T3ProjectFileLoader from "./project/T3ProjectFileLoader.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import * as WorkspaceEntries from "./workspace/WorkspaceEntries.ts";
import * as KnownWorkspaces from "./workspace/KnownWorkspaces.ts";
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
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as SourceControlRepositoryService from "./sourceControl/SourceControlRepositoryService.ts";
import * as WorktreeSetupTracker from "./project/WorktreeSetupTracker.ts";
import * as Observability from "./observability/Observability.ts";
import * as HeapSnapshot from "./observability/HeapSnapshot.ts";
import * as EventLoopMonitor from "./observability/EventLoopMonitor.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as DirectEndpoints from "./environment/DirectEndpoints.ts";
import * as RemoteOpenTargets from "./environment/RemoteOpenTargets.ts";
import * as AuthHttp from "./auth/http.ts";
import * as ReplayMarkers from "./auth/replayMarkers.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as CodexManagedTokenBroker from "./provider/CodexManagedTokenBroker.ts";
import * as WebhookRoute from "./scheduledTasks/webhookRoute.ts";
import * as RelayDeliveryProof from "./scheduledTasks/RelayDeliveryProof.ts";
import * as HeldHooksWaker from "./relay/HeldHooksWaker.ts";
import * as McpOAuth from "./auth/McpOAuth.ts";
import * as McpOAuthHttp from "./auth/mcpOAuthHttp.ts";
import {
  relayHookBaseUrl,
  ScheduledTaskWebhookOrigin,
} from "./scheduledTasks/ScheduledTaskService.ts";
import {
  CLOUD_ENDPOINT_RUNTIME_CONFIG,
  decodeRuntimeConfig,
  RELAY_URL_SECRET,
} from "./cloud/config.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import * as CloudHttp from "./cloud/http.ts";
import * as GuestHttp from "./guest/http.ts";
import * as CloudLink from "./cloud/CloudLink.ts";
import * as ConnectReachability from "./cloud/ConnectReachability.ts";
import { pendingServiceUpdateExists } from "./cloud/updateHandoff.ts";
import * as RelayTracing from "./cloud/relayTracing.ts";
import * as CloudManagedEndpointRuntime from "./cloud/ManagedEndpointRuntime.ts";
import {
  MANAGED_TUNNEL_FIRST_REGISTRATION_JITTER,
  makeManagedTunnelRecovery,
  managedTunnelStartupAction,
  retryDesiredLinkReconcile,
  retryManagedTunnelRegistration,
} from "./cloud/managedTunnelStartup.ts";
import * as CloudCliTokenManager from "./cloud/CliTokenManager.ts";
import * as CloudCliState from "./cloud/CliState.ts";
import * as ConnectCredentialMinter from "./cloud/t3team-ConnectCredentialMinter.ts";
import * as ConnectSignInPrompt from "./cloud/t3team-ConnectSignInPrompt.ts";
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
import * as TriageService from "./triage/TriageService.ts";
import * as DesktopTelemetryReceiver from "./resourceTelemetry/DesktopTelemetryReceiver.ts";
import * as NativeTelemetryClient from "./resourceTelemetry/NativeTelemetryClient.ts";
import * as ResourceAttribution from "./resourceTelemetry/ResourceAttribution.ts";
import * as ResourceMonitorBinary from "./resourceTelemetry/ResourceMonitorBinary.ts";
import * as OffThreadChildProcessSpawner from "./process/t3team-offThreadChildProcessSpawner.ts";
import * as ProcessGroupMetrics from "./resourceTelemetry/ProcessGroupMetrics.ts";
import * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import * as AntigravityUsage from "./provider/Drivers/AntigravityUsage.ts";
import { MuseUsageHome } from "@t3tools/provider-muse/server";
import * as CursorAccountReader from "@t3tools/provider-cursor/server/CursorAccountReader";
import * as CursorKeychain from "@t3tools/provider-cursor/server/CursorKeychain";
import * as CursorUsageAccounts from "@t3tools/provider-cursor/server/CursorUsageAccounts";
import * as UsageService from "./usage/UsageService.ts";
import * as CodexUsageHistory from "./usage/CodexUsageHistory.ts";
import * as RuntimeLayer from "./orchestration-v2/runtimeLayer.ts";
import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import * as ThreadSearch from "./orchestration-v2/ThreadSearch.ts";
import * as ThreadSettlementService from "./orchestration-v2/ThreadSettlementService.ts";
import * as IdleCompactionService from "./orchestration-v2/IdleCompactionService.ts";
import * as ThreadPullRequestService from "./orchestration-v2/ThreadPullRequestService.ts";
import * as RunFinalizationService from "./orchestration-v2/RunFinalizationService.ts";
import * as EventStoreV2 from "./orchestration-v2/EventStore.ts";
import * as ProjectionMaintenance from "./orchestration-v2/ProjectionMaintenance.ts";
import * as ProjectionStoreV2 from "./orchestration-v2/ProjectionStore.ts";
import { makePersistedServerRuntimeState } from "./serverRuntimeState.ts";
import { acceptsPrivateNetworkConnection, loopbackUrlHostForAddress } from "./startupAccess.ts";
import * as OrchestrationHttp from "./orchestration-v2/http.ts";
import * as ProjectHttp from "./project/http.ts";
import { WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStoreLive } from "./persistence/WorkflowSignalStore.ts";
import { WorkflowTriggerLaunchStoreLive } from "./persistence/t3team-WorkflowTriggerLaunchStore.ts";
import { WorkflowJournalStoreLive } from "./persistence/SqliteJournalStore.ts";
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
  t3teamAtlassianDisconnectRouteLayer,
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
import { t3teamNexiUpdateRouteLayer } from "./t3team-nexiUpdate-routes.ts";
import { t3teamTempoRouteLayer } from "./t3team-tempo-routes.ts";
import { t3teamCloudBrokerRouteLayer } from "./t3team-cloud-broker-routes.ts";
import { startHostServices, withHostServices } from "./t3team-hostServices.ts";
import { hostServiceRoutes } from "./t3team-hostServiceRoutes.ts";
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
import { t3teamRecipeHeadlessLaunchRouteLayer } from "./t3team-recipeHeadlessLaunchRoutes.ts";
import { t3teamRecipeTriggerStatusRouteLayer } from "./t3team-recipeTriggerStatusRoute.ts";
import {
  T3TeamRecipeTriggerRunner,
  T3TeamRecipeTriggerRunnerLive,
} from "./t3team-recipeTriggerRunner.ts";
import { t3teamThreadDraftMutationStatusRouteLayer } from "./t3team-thread-draftMutation-status-route.ts";
import { t3teamThreadJobsRouteLayer } from "./t3team-thread-jobs-route.ts";
import { t3teamThreadWorkflowControlRouteLayer } from "./t3team-thread-workflow-control-route.ts";
import { ResourcePressureMonitorLive } from "./t3team-resourcePressureMonitor.ts";
import * as FeatureFlags from "./t3team-FeatureFlags.ts";
import {
  t3teamGitHubAssetRouteLayer,
  t3teamGitHubInboxRouteLayer,
  t3teamGitHubPullRequestContextRouteLayer,
} from "./t3team-github-routes.ts";
import { t3teamProjectWorkspaceBootstrapRouteLayer } from "./t3team-project-repository-routes.ts";
import { T3TeamLinkedRepositorySyncLive } from "./t3team-linkedRepositorySync.ts";
import {
  t3teamProjectMainRepositoryRouteLayer,
  t3teamStateMigrationResumeLayer,
} from "./t3team-projectMainRepositoryRoute.ts";
import { t3teamThreadToolContextRouteLayer } from "./t3team-thread-tool-context-routes.ts";
import { t3teamThreadPlacementRouteLayer } from "./t3team-thread-placement-routes.ts";
import { t3teamVoiceRouteLayer } from "./t3team-voice-routes.ts";
import { t3teamMyWorkDigestRouteLayer } from "./t3team-myworkDigest-routes.ts";
import { T3TeamThreadToolContextStoreLive } from "./t3team-threadToolContextStore.ts";
import { turnInactivityPolicyLive } from "./orchestration-v2/t3team-turnInactivityPolicy.ts";
import { coldLocalCompactionLive } from "./orchestration-v2/t3team-coldLocalCompactionLive.ts";
import { packCompletionWakeRendererLive } from "./t3team-pack-completionWakeRenderer.ts";
import { providerUsageWakeRendererLive } from "./t3team-providerUsageWakeRenderer.ts";
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
import { T3TeamStallProfilerLive } from "./t3team-stallProfilerLive.ts";
import { StandbyInterestLive } from "./cloud/t3team-StandbyInterest.ts";
import { layer as CloudSessionMachinesLayer } from "./cloud/t3team-CloudSessionMachine.ts";
import { layer as ProjectMachineDiscoveryLayer } from "./project/t3team-ProjectMachineDiscovery.ts";
import { layer as MachineDefinitionFinderLayer } from "./project/t3team-MachineDefinitionFinder.ts";
import { layer as MachineSourceProposalLayer } from "./project/t3team-MachineSourceProposal.ts";
import { T3TeamSettleGuardsLive } from "./t3team-childSettleGuards.ts";
import { T3TeamThreadTransientTurnRetryLive } from "./t3team-threadTransientTurnRetry.ts";
import {
  T3TeamSilenceWatchPortLive,
  T3TeamThreadSilenceWatchReactorLive,
} from "./t3team-threadSilenceWatchReactorLive.ts";
import { T3TeamWorkflowEngineRehydrateLive } from "./t3team-workflowEngineRehydrate.ts";
import { T3TeamKickoffRecipeLive } from "./t3team-kickoffRecipe.ts";
import { T3TeamWorkflowSignalDeliveryLive } from "./t3team-workflowSignalDelivery.ts";
import { T3TeamWorkflowSignalReconcilerLive } from "./t3team-workflowSignalReconciler.ts";
import { T3TeamWorkflowEngineRegistryLive } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSchedulerSweepLive } from "./t3team-workflowSchedulerSweepLive.ts";
import { T3TeamToolBrokerLive } from "./t3team-toolBrokerLive.ts";
import * as T3TeamChangeRequestPublisher from "./t3team-changeRequestPublisher.ts";
import * as T3TeamScriptHost from "./t3team-scriptHostContext.ts";
import * as HtmlRender from "./htmlRender/HtmlRender.ts";
import { T3TeamV2FoundationLive } from "./t3team-v2/t3team-v2FoundationLive.ts";
import * as T3TeamWorkflowHost from "./t3team-workflowHost.ts";
import { T3TeamChildThreadMetadataLive } from "./t3team-childThreadMetadata.ts";
import { T3TeamAskUserWriterLive } from "./mcp/toolkits/t3team/t3team-askUserWriter.ts";
import { T3TeamDelegatedTaskPreparationLive } from "./t3team-delegateTaskPreparationLive.ts";
import { T3TeamDelegateCloudSessionsLayer } from "./t3team-delegateTaskCloudSessionLayer.ts";
import * as NetService from "@t3tools/shared/Net";
import * as RelayClient from "@t3tools/shared/relayClient";
import { disableTailscaleServe, ensureTailscaleServe } from "@t3tools/tailscale";
import * as ServerActivation from "./serverActivation.ts";

// Escaped MCP handoff provenance can exceed find-my-way's 100-character segment default.
const HTTP_ROUTER_CONFIG = {
  maxParamLength: 512,
} as const;

// Skip Effect's default 20 s grace; WebSocket scope finalizers already close connections gracefully.
const HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS = 0;
const layerResourceAttribution = ResourceAttribution.layer;
const layerApplicationObservability = EventLoopMonitor.layer.pipe(
  Layer.provideMerge(Observability.layer),
  Layer.provideMerge(layerResourceAttribution),
);

// Share rotation state so driver loggers cannot race.
const layerProviderEventLoggers = Layer.effect(
  ProviderEventLoggers.ProviderEventLoggers,
  Effect.gen(function* () {
    const { providerEventLogPath } = yield* ServerConfig.ServerConfig;
    const attribution = yield* ResourceAttribution.ResourceAttribution;
    const store = yield* EventNdjsonLogger.makeEventNdjsonLogStore(providerEventLogPath, {
      attribution,
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning(error.message, { error }).pipe(
          Effect.annotateLogs({ scope: "provider-observability" }),
          Effect.as(undefined),
        ),
      ),
    );
    if (!store) return ProviderEventLoggers.NoOpProviderEventLoggers;
    yield* Effect.addFinalizer(() => store.close());
    return { native: store.logger("native"), canonical: store.logger("canonical") };
  }),
);

const layerPtyAdapter = NodePtyAdapter.layer;

const layerServerSettings = ServerSettings.layer.pipe(
  Layer.provide(ServerSecretStore.layer),
  Layer.provideMerge(SqlitePersistence.layerConfig),
);

// The resource monitor is an unsigned sidecar launched on every boot: its CreateProcess can sit in
// an antivirus reputation check for seconds, so it is spawned off the event loop.
const layerNativeTelemetry = NativeTelemetryClient.layer.pipe(
  Layer.provide(ResourceMonitorBinary.layer),
  Layer.provide(OffThreadChildProcessSpawner.layer),
);
const layerDesktopTelemetryReceiver = DesktopTelemetryReceiver.layer.pipe(
  Layer.provideMerge(layerServerSettings),
);

const layerResourceTelemetry = ResourceTelemetry.layer.pipe(
  Layer.provideMerge(layerNativeTelemetry),
  Layer.provideMerge(layerDesktopTelemetryReceiver),
);

const layerHostPowerMonitor = HostPowerMonitor.layer.pipe(
  Layer.provide(layerDesktopTelemetryReceiver),
);

// A fresh receiver layer would open a second reader on the desktop telemetry fd.
const layerDesktopAppUpdate = DesktopAppUpdate.layer.pipe(
  Layer.provide(layerDesktopTelemetryReceiver),
);

const layerBackground = BackgroundPolicy.layer.pipe(
  Layer.provide(layerHostPowerMonitor),
  Layer.provideMerge(layerServerSettings),
);

const layerUsage = UsageService.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      AntigravityUsage.layer,
      MuseUsageHome.layer,
      CodexUsageHistory.layer,
      CursorUsageAccounts.layer.pipe(
        Layer.provide(CursorAccountReader.layer.pipe(Layer.provide(CursorKeychain.layer))),
      ),
    ).pipe(Layer.provide(ProviderHostLive.layer.pipe(Layer.provide(ServerSecretStore.layer)))),
  ),
  Layer.provide(layerServerSettings),
);

const layerResourceDiagnostics = Layer.mergeAll(
  HostResources.layer,
  layerResourceTelemetry,
  ProcessDiagnostics.layer.pipe(Layer.provide(layerResourceTelemetry)),
  ProcessResourceMonitor.layer.pipe(Layer.provide(layerResourceTelemetry)),
  // Flag NEXI_FF_RESOURCE_PRESSURE: off = a constant "disabled" report, no fiber.
  ResourcePressureMonitorLive.pipe(
    Layer.provide(Layer.mergeAll(HostResources.layer, layerResourceTelemetry)),
  ),
  ProcessGroupMetrics.layer.pipe(Layer.provide(layerResourceTelemetry)),
);

const layerRelayClient = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return RelayClient.layerCloudflared({ baseDir: config.baseDir });
  }),
);

const layerHttpServer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return NodeHttpServer.layer(
      () => {
        const server = rejectRequestsUntilServing(
          guardHttpResponseWriteErrors(NodeHttp.createServer()),
        );
        if (config.privateNetworkOnly) {
          server.on("connection", (socket) => {
            if (!acceptsPrivateNetworkConnection(socket)) {
              socket.destroy();
            }
          });
        }
        return server;
      },
      {
        host: config.host ?? "127.0.0.1",
        port: config.port,
        gracefulShutdownTimeout: HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS,
        // Context takeover stays enabled (ws default) so the compression
        // window is shared across frames — that also makes small frames cheap
        // to compress, so no size threshold is set (ws only honors
        // `threshold` when context takeover is disabled).
        websocket: { perMessageDeflate: true },
      },
    );
  }),
);

// t3team: the process spawner every service sees is the paced one (see t3team-pacedChildProcessSpawner).
const layerPlatformServices = DocumentText.layer.pipe(
  Layer.provideMerge(Layer.provideMerge(PacedChildProcessSpawner.layer(), NodeServices.layer)),
);

const layerPersistence = Layer.empty.pipe(Layer.provideMerge(SqlitePersistence.layerConfig));

const layerVcsDriverRegistry = VcsDriverRegistry.layer.pipe(Layer.provide(VcsProjectConfig.layer));

const layerSourceControlProviderRegistry = SourceControlProviderRegistry.layer.pipe(
  Layer.provideMerge(SourceControlBuiltInDrivers.layer),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(layerVcsDriverRegistry),
  // t3team: the fork's GitHub facade (GitHubApi, GitHubRest, quota, credentials) is read by the
  // websocket routes, the inbox and the cloud-session layers. Upstream's GitHub driver builds its own
  // transport inside the driver, so the facade must be the outermost provider: it is built first and
  // the driver's forked memo map reuses it, giving one quota/credential/coalescer state. Its host,
  // rate-limit and VCS requirements are the same layer references the chain uses, so they share too.
  Layer.provideMerge(
    GitHubApi.layerWithDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          ServerSourceControlHost.layer,
          SourceControlRateLimit.layer,
          GitVcsDriver.layer,
          layerVcsDriverRegistry,
        ),
      ),
    ),
  ),
);

const layerRepositoryIdentityResolver = Layer.effect(
  RepositoryIdentityResolver.RepositoryIdentityResolver,
  Effect.gen(function* () {
    const registry = yield* SourceControlProviderRegistry.SourceControlProviderRegistry;
    return yield* RepositoryIdentityResolver.make({
      refine: Effect.fn(function* (identity: RepositoryIdentity) {
        for (const { kind } of BUILT_IN_SOURCE_CONTROL_DRIVER_LIST) {
          const provider = yield* registry.get(kind);
          if (provider.refineRepositoryIdentity === undefined) continue;
          const refined = yield* provider.refineRepositoryIdentity({
            identity,
            resolveContext: (input) =>
              registry.resolveHandle(input).pipe(Effect.map((handle) => handle.context)),
          });
          if (refined !== identity) return refined;
        }
        return identity;
      }),
    });
  }),
).pipe(Layer.provide(layerSourceControlProviderRegistry), Layer.provide(ProcessRunner.layer));

const layerPullRequestService = PullRequestService.layer.pipe(
  // One registry entry per supported host; the service only knows the registry.
  Layer.provide(PullRequestProviderRegistry.layer),
  Layer.provide(PullRequestFilesViewed.layer),
  Layer.provide(PullRequestReadCache.layer),
  Layer.provide(layerSourceControlProviderRegistry),
  Layer.provide(SourceControlRateLimit.layer),
  Layer.provide(VcsProcess.layer),
  // t3team: project linked repositories are read from the workspace's .t3team context directory.
  Layer.provide(WorkspacePaths.layer),
);

const layerGitManager = GitManager.layer.pipe(
  Layer.provide(Layer.merge(ProjectionStoreV2.layer, ProjectStore.layer)),
  Layer.provideMerge(RuntimeLayer.layerProjectSetupScriptRunner),
  Layer.provideMerge(WorktreeSetupTracker.layer),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(layerSourceControlProviderRegistry),
  Layer.provideMerge(TextGeneration.layer.pipe(Layer.provide(layerSourceControlProviderRegistry))),
);

const layerSourceControlRepositoryService = SourceControlRepositoryService.layer.pipe(
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(layerSourceControlProviderRegistry),
);

const layerGit = Layer.empty.pipe(
  Layer.provideMerge(
    layerGitManager.pipe(
      // t3team: a pull request checkout in a linked repository clones it on demand. Same
      // `T3TeamLinkedRepositorySyncLive` reference as the application's provision below: one build
      // memoizes it, so routes, MCP tools, delegations and GitManager share one job registry.
      Layer.provideMerge(
        T3TeamLinkedRepositorySyncLive.pipe(
          Layer.provideMerge(layerSourceControlRepositoryService),
        ),
      ),
    ),
  ),
  Layer.provideMerge(GitVcsDriver.layer),
);

const layerGitWorkflow = GitWorkflowService.layer.pipe(
  Layer.provideMerge(layerVcsDriverRegistry),
  Layer.provideMerge(layerGit),
);

const layerProjectCloneTracker = ProjectCloneTracker.layer.pipe(
  Layer.provide(layerSourceControlRepositoryService),
);

const layerKnownWorkspaces = KnownWorkspaces.layer.pipe(
  Layer.provide(ProjectStore.layer),
  Layer.provide(GitVcsDriver.layer),
);

const layerReview = ReviewService.layer.pipe(
  Layer.provideMerge(layerKnownWorkspaces),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(layerVcsDriverRegistry),
);

const layerVcs = Layer.empty.pipe(
  Layer.provideMerge(VcsProjectConfig.layer),
  Layer.provideMerge(layerVcsDriverRegistry),
  Layer.provideMerge(VcsProvisioningService.layer.pipe(Layer.provide(layerVcsDriverRegistry))),
  Layer.provideMerge(layerGitWorkflow),
  Layer.provideMerge(layerReview),
  Layer.provideMerge(layerSourceControlRepositoryService),
  Layer.provideMerge(
    SourceControlSignIn.layer.pipe(Layer.provide(layerSourceControlProviderRegistry)),
  ),
  Layer.provideMerge(layerProjectCloneTracker),
  Layer.provideMerge(
    VcsStatusBroadcaster.layer.pipe(
      Layer.provide(layerGitWorkflow),
      Layer.provide(VcsStatusBroadcaster.layerAutomaticFetchInterval),
      // The orchestration runtime also consumes the broadcaster (run
      // finalization), so the policy cannot read the store from the runtime's
      // output.
      Layer.provide(
        VcsStatusBroadcaster.layerAutoPullPolicy.pipe(Layer.provide(ProjectStore.layer)),
      ),
    ),
  ),
);

const layerCheckpointStore = CheckpointStore.layer.pipe(Layer.provide(layerVcsDriverRegistry));

const layerPortScanner = PortScanner.layer.pipe(Layer.provide(ProcessRunner.layer));

const layerTerminal = TerminalManager.layer.pipe(
  Layer.provide(layerPtyAdapter),
  Layer.provide(layerPortScanner),
  Layer.provide(layerNativeTelemetry),
);

// "Connected tools" sign-in flows. Reuses the same real pty service the
// terminal does — see apps/server/src/toolauth/t3team-ToolAuthService.ts.
const layerToolAuth = ToolAuthService.layer.pipe(Layer.provide(layerPtyAdapter));

const layerPreview = Layer.empty.pipe(
  Layer.provideMerge(PreviewManager.layer),
  Layer.provideMerge(layerPortScanner),
);

const layerDevice = DeviceService.layer.pipe(
  Layer.provide(layerServerSettings),
  Layer.provide(ProcessRunner.layer),
  Layer.provide(NetService.layer),
);

const layerWorkspaceEntries = WorkspaceEntries.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provideMerge(layerVcsDriverRegistry),
);

const layerWorkspaceFileSystem = WorkspaceFileSystem.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provide(layerWorkspaceEntries),
  Layer.provide(layerKnownWorkspaces),
);

const layerWorkspace = Layer.mergeAll(
  WorkspacePaths.layer,
  layerWorkspaceEntries,
  layerWorkspaceFileSystem,
);

const layerProjectFaviconResolver = ProjectFaviconResolver.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provide(T3ProjectFileLoader.layer),
);

const layerServerEnvironment = ServerEnvironment.layer.pipe(Layer.provide(ServerSecretStore.layer));

const layerAuth = EnvironmentAuth.layer.pipe(
  Layer.provideMerge(layerPersistence),
  Layer.provide(layerServerEnvironment),
  Layer.provide(ServerSecretStore.layer),
);

const layerCloudManagedEndpointRuntime = Layer.mergeAll(
  layerRelayClient,
  CloudManagedEndpointRuntime.layer.pipe(
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(layerRelayClient),
  ),
);

// The workflow-engine singletons share one provideMerge slot (the `pipe` arity is capped):
// the in-memory run registry (reactor's hot index) + the durable run record + the SQLite
// journal store. Repo + store get the memoized SqlClient from layerPersistence (Epic 25
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
  Layer.provide(layerPersistence),
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

// t3team: recipe triggers (S5b) — reconcile the per-project `trigger:<recipe>:<id>` signal
// registrations, drain the signal inbox on a timer, and launch headless runs. One shared
// runner per process; the engine chain below is the SAME singletons the tool broker and the
// thread-bound launch use (layer references memoize). Defined after T3TeamWorkflowHostLive so
// it can share that const instead of rebuilding the host layer.
const T3TeamRecipeTriggerRunnerLayer = T3TeamRecipeTriggerRunnerLive.pipe(
  Layer.provideMerge(WorkflowTriggerLaunchStoreLive),
  Layer.provideMerge(WorkflowSignalSourcesLive),
  Layer.provide(T3TeamWorkflowHostLive),
  Layer.provide(T3TeamScriptHost.layer.pipe(Layer.provide(layerPullRequestService))),
  Layer.provide(T3TeamV2FoundationLive),
);

// Start it the way upstream starts its own workers: one effectDiscard layer that parks the
// timer loop and stops it on scope close.
const T3TeamRecipeTriggerRunnerStartLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const runner = yield* T3TeamRecipeTriggerRunner;
    yield* runner.start();
    yield* Effect.addFinalizer(() => runner.stop());
  }),
).pipe(Layer.provide(T3TeamRecipeTriggerRunnerLayer));

// The fork MCP tool broker and the in-memory stores it shares with the routes/reactors.
const T3TeamToolBrokerLayerLive = T3TeamToolBrokerLive.pipe(
  Layer.provideMerge(T3TeamThreadToolContextStoreLive),
  Layer.provideMerge(T3TeamWidgetRegistryLive),
  Layer.provideMerge(T3TeamContextRefreshServiceLive),
  Layer.provide(WorkflowSignalSourcesLive),
  // The broker mounts beneath the runtime head, so the V2 orchestration tools only see the host
  // (`serviceOption` at construction) when it is provided to the broker itself.
  Layer.provide(T3TeamWorkflowHostLive),
  Layer.provide(ProviderRegistry.layer),
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
  Layer.provide(layerPullRequestService),
  // html format on t3_show_widget shims onto upstream HtmlRender.publish (Phil 2026-10-06).
  // Same HtmlRender + PreviewBrowser pair the MCP html_render toolkit uses.
  Layer.provide(HtmlRender.layer),
  Layer.provide(PreviewBrowser.layer),
  // t3team: `t3team.change_request.publish` commits, pushes and opens the change request through
  // the same git stack the Git panel uses (memoized layer references).
  Layer.provide(
    T3TeamChangeRequestPublisher.layer.pipe(
      Layer.provide(layerGit),
      Layer.provide(WorkspacePaths.layer),
    ),
  ),
);

const layerScheduledTaskWebhookOrigin = Layer.effect(
  ScheduledTaskWebhookOrigin,
  Effect.gen(function* () {
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    return Effect.gen(function* () {
      const [relayUrl, tunnelConfig] = yield* Effect.all([
        secrets.get(RELAY_URL_SECRET),
        secrets.get(CLOUD_ENDPOINT_RUNTIME_CONFIG),
      ]).pipe(Effect.orElseSucceed(() => [Option.none(), Option.none()] as const));
      if (Option.isNone(relayUrl) || Option.isNone(tunnelConfig)) {
        return { relayHookBaseUrl: null };
      }
      const config = decodeRuntimeConfig(new TextDecoder().decode(tunnelConfig.value));
      return {
        relayHookBaseUrl: relayHookBaseUrl({
          relayUrl: new TextDecoder().decode(relayUrl.value),
          tunnelName: Option.isSome(config) ? config.value.tunnelName : undefined,
        }),
      };
    });
  }),
);

const layerOrchestrationV2Runtime = RuntimeLayer.layerProduction.pipe(
  // t3team: host turn-inactivity watchdog budget per provider instance.
  Layer.provide(turnInactivityPolicyLive),
  // t3team: the ONE settle-guard override (workflow run, live child, parent wait, settled
  // parent); other fork guards compose into it (t3team-childSettleGuards.ts).
  Layer.provide(T3TeamSettleGuardsLive),
  // t3team: pack-registered delegated-completion wake text (default text without a pack), then
  // the children's provider-usage lines appended over whichever renderer that is.
  Layer.provide(
    providerUsageWakeRendererLive.pipe(
      Layer.provide(packCompletionWakeRendererLive.pipe(Layer.provide(ProjectionStoreV2.layer))),
      Layer.provide(ProjectionStoreV2.layer),
    ),
  ),
  // t3team: pack-registered cold-cache local compaction (native `/compact` without a route).
  Layer.provide(coldLocalCompactionLive),
  Layer.provide(layerScheduledTaskWebhookOrigin),
  Layer.provide(ProviderEventIngestor.layerAnalytics),
  Layer.provide(layerCheckpointStore),
  Layer.provide(layerGitWorkflow),
  Layer.provide(
    RunFinalizationService.layerObserver.pipe(
      Layer.provide(ProjectionStoreV2.layer),
      Layer.provide(layerPullRequestService),
      Layer.provide(RuntimeLayer.layerProjectService),
    ),
  ),
);

const layerOrchestrationApplication = CheckpointDiffQuery.layer.pipe(
  Layer.provideMerge(layerCheckpointStore),
  Layer.provideMerge(layerOrchestrationV2Runtime),
);

const layerThreadSettlementWorker = Layer.effectDiscard(
  ThreadSettlementService.make.pipe(Effect.flatMap((service) => service.start())),
).pipe(
  Layer.provide(layerPullRequestService),
  Layer.provide(ProjectionStoreV2.layer),
  // t3team: the sweep skips what the settle guards refuse (same layer reference as the runtime's).
  Layer.provide(T3TeamSettleGuardsLive),
);

const layerIdleCompactionWorker = Layer.effectDiscard(
  IdleCompactionService.make.pipe(Effect.flatMap((service) => service.start())),
).pipe(Layer.provide(ProjectionStoreV2.layer));

const layerThreadPullRequestWorker = Layer.effectDiscard(
  ThreadPullRequestService.make.pipe(Effect.flatMap((service) => service.start())),
).pipe(Layer.provide(layerPullRequestService));

const layerProviderInstallationRefresh = Layer.effectDiscard(
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

const layerRuntimeCoreDependenciesBase = Layer.mergeAll(
  AgentAwarenessRelay.layer,
  HeldHooksWaker.layer,
  layerThreadSettlementWorker,
  layerIdleCompactionWorker,
  // t3team: the service is also read by the resource-pressure "sweep now" RPC (`sweepNow`).
  StorageCleanup.layer.pipe(Layer.provide(ProjectionStoreV2.layer)),
  DatabaseStorage.layer.pipe(
    Layer.provide(ProjectionMaintenance.layer),
    Layer.provide(
      Layer.merge(EventStoreV2.layerFromOrchestrationEventStore, ProjectionStoreV2.layer),
    ),
  ),
  layerThreadPullRequestWorker,
  DelegatedTaskAnalytics.layer,
  Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* PullRequestSyncReactor.PullRequestSyncReactor;
      yield* service.start();
    }),
  ).pipe(
    Layer.provideMerge(PullRequestSyncReactor.layer),
    Layer.provide(layerPullRequestService),
    Layer.provide(ProjectionStoreV2.layer),
  ),
  Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* PullRequestWatchReactor.PullRequestWatchReactor;
      yield* service.start();
    }),
  ).pipe(
    Layer.provide(PullRequestWatchReactor.layer),
    Layer.provide(layerPullRequestService),
    Layer.provide(ProjectionStoreV2.layer),
  ),
  Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* DelegatedTaskQuestionReactor.DelegatedTaskQuestionReactor;
      yield* service.start();
    }),
  ).pipe(Layer.provide(DelegatedTaskQuestionReactor.layer), Layer.provide(ProjectionStoreV2.layer)),
  ProviderUsageLimitsIngestion.layer,
  layerProviderInstallationRefresh,
  ReplayMarkers.layer,
  T3TeamThreadToolContextEvictionReactorStartLive,
  T3TeamProjectSourceIconReactorStartLive,
  T3TeamRecipeTriggerRunnerStartLive,
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
  Layer.effectDiscard(ProjectSettingsOverrideSweep.sweep),
).pipe(
  // t3team: the tool broker reads several capabilities through serviceOption at construction
  // time. Mount it before the runtime services so the later provideMerges expose the production
  // singletons to it as well as to the reactors, rather than constructing a dependency-blind broker.
  (runtimeHead) => mountT3TeamBrokerBeforeRuntimeServices(runtimeHead, T3TeamToolBrokerLayerLive),
  Layer.provideMerge(layerOrchestrationApplication),
  Layer.provideMerge(RuntimeLayer.layerEventInfrastructure),
  Layer.provideMerge(Layer.merge(ProjectStore.layer, ThreadSearch.layer)),
  Layer.provideMerge(layerServerSettings),
  // Signal sources (GHE #332): placed BEFORE the PullRequestService + Persistence provides
  // below — in `a.pipe(provideMerge(b))` the accumulated layer's requirements are satisfied
  // by b at this step only, so the signal chain's external {PullRequestService, SqlClient}
  // must be satisfied by a LATER step: PRS by the mergeAll below, SqlClient by layerPersistence.
  Layer.provideMerge(WorkflowSignalSourcesLive),
  // The asset route uses the registry's GitHub credential for private PR media.
  // t3team: PullRequestService is also exposed here (same memoized instance every consumer is
  // given) for the signal sources and the fork routes/tools that read pull requests. It stays in
  // the registry's own step, as before: neither provides to the other.
  Layer.provideMerge(Layer.mergeAll(layerSourceControlProviderRegistry, layerPullRequestService)),
  // t3team: PullRequestService reads ProjectService, which the OrchestrationApplication step above
  // cannot hand to a later step; the runtime's own layer reference memoizes to that instance.
  Layer.provideMerge(RuntimeLayer.layerProjectService),
  Layer.provideMerge(layerGit),
  Layer.provideMerge(layerVcs),
  Layer.provideMerge(Layer.mergeAll(layerTerminal, layerPreview, layerDevice, layerToolAuth)),
  Layer.provideMerge(layerPersistence),
  Layer.provideMerge(
    Layer.mergeAll(Keybindings.layer, EnvironmentTheme.layer, UsageLimitSources.layer),
  ),
  Layer.provideMerge(ProviderRegistry.layer),
  Layer.provideMerge(ProviderInstanceRegistryHydration.layer),
  Layer.provideMerge(T3TeamRemoteEnvironmentLive),
  // Provider hydration builds the Claude runner, which reports agents to the same scanner the
  // terminal and preview layers share.
  Layer.provideMerge(layerPortScanner),
  Layer.provideMerge(
    Layer.mergeAll(
      AntigravityInstallation.AntigravityInstallation.layer,
      CodexInstallation.CodexInstallation.layer,
    ),
  ),
);

const layerRuntimeCoreDependencies = layerRuntimeCoreDependenciesBase.pipe(
  Layer.provideMerge(layerPtyAdapter),
  Layer.provideMerge(AcpRegistrySupport.layerFromHost.pipe(Layer.provide(ProviderHostLive.layer))),
  Layer.provideMerge(
    Layer.mergeAll(
      layerProviderEventLoggers,
      ModelManifest.layerModelCatalog.pipe(Layer.provideMerge(ModelManifest.layer)),
      ResetCreditCoordinator.layer,
      ProviderLatestVersions.layer,
      McpProviderSessions.layer,
    ),
  ),
  Layer.provideMerge(
    OpenCodeRuntime.layer.pipe(
      Layer.provide(
        Layer.unwrap(
          Effect.gen(function* () {
            const config = yield* ServerConfig.ServerConfig;
            return OpenCodeServerLedger.layer({ stateDir: config.stateDir });
          }),
        ),
      ),
    ),
  ),
  Layer.provideMerge(layerWorkspace),
  Layer.provideMerge(ProjectEnrichmentService.layer),
  Layer.provideMerge(Layer.mergeAll(NativeAppIconResolver.layer, layerProjectFaviconResolver)),
  Layer.provideMerge(layerRepositoryIdentityResolver),
  Layer.provideMerge(CodexManagedTokenBroker.layer),
  Layer.provideMerge(layerServerEnvironment),
  Layer.provideMerge(layerAuth),
  // Report-only sign-in state plus the user-started browser sign-in; it shares the minter
  // below, so a cloud-session create and a notice click never open two sign-ins.
  Layer.provideMerge(ConnectSignInPrompt.layer),
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
      layerCloudManagedEndpointRuntime,
    ),
  ),
);

const layerRuntimeDependencies = withHostServices(layerRuntimeCoreDependencies).pipe(
  Layer.provideMerge(layerUsage),
  Layer.provideMerge(layerBackground),
  Layer.provideMerge(layerResourceDiagnostics),
  Layer.provideMerge(TraceDiagnostics.layer),
  Layer.provideMerge(TriageService.layer.pipe(Layer.provide(GitVcsDriver.layer))),
  Layer.provideMerge(AnalyticsService.layer),
  Layer.provideMerge(ExternalLauncher.layer),
  Layer.provideMerge(RemoteOpenTargets.layer),
  Layer.provideMerge(DirectEndpoints.layer),
  Layer.provideMerge(ServerLifecycleEvents.layer),
  // Last provided = built first: user flag values are loaded before any flag-gated service
  // (resource pressure, reactors, routes) reads its startup-only flag.
  Layer.provideMerge(FeatureFlags.layer.pipe(Layer.provide(layerPersistence))),
  Layer.provide(NetService.layer),
);

const layerCommandReadiness = HttpRouter.middleware(
  (httpEffect) =>
    Effect.flatMap(ServerRuntimeStartup.ServerRuntimeStartup, (startup) =>
      startup.awaitCommandReady.pipe(Effect.orDie, Effect.andThen(httpEffect)),
    ),
  { global: true },
);

const layerMakeRoutes = Layer.mergeAll(
  Layer.mergeAll(
    HttpApiBuilder.layer(EnvironmentHttpApi).pipe(
      Layer.provide(AuthHttp.layer),
      Layer.provide(McpOAuthHttp.layer.pipe(Layer.provide(McpOAuth.layer))),
      Layer.provide(CloudHttp.layer),
      Layer.provide(OrchestrationHttp.layer),
      Layer.provide(PullRequestHttp.layer),
      Layer.provide(ProjectHttp.layer),
      Layer.provide(ServerHttp.layerServerEnvironmentHttpApi),
      Layer.provide(WebhookRoute.layer.pipe(Layer.provide(RelayDeliveryProof.layer))),
      Layer.provide(AuthHttp.layerAuthenticatedAuth),
    ),
    ServerHttp.layerOtlpTracesProxyRoute,
    ServerHttp.layerAssetRoute,
    ServerHttp.layerAttachmentUploadRoute,
    GuestHttp.layer,
    DeviceHubProxy.layer,
    ServerBrowserStream.routeLayer,
    ServerHttp.layerStaticAndDevRoute,
    Ws.layer,
  ),
  // t3team routes. This is now the ONLY route registry: the parallel `makeT3TeamRoutesLayer`
  // in `t3team-server.ts` was deleted in the 2026-08 upstream sync, since the two copies drifted
  // every time upstream moved. The `t3team` binary launches this same layer (cli/t3team-server.ts).
  // Routes that carry their own capability (t3team-routeAuth.ts says why each one may).
  Layer.mergeAll(
    t3teamAtlassianOAuthCallbackRouteLayer,
    t3teamCloudBrokerRouteLayer,
    hostServiceRoutes,
    t3teamAccountRouteLayer,
  ),
  // Every other t3team route requires a session, like upstream's raw routes (t3team-routeAuth.ts).
  Layer.mergeAll(
    t3teamAtlassianAccountsRouteLayer,
    t3teamAtlassianAssetContentRouteLayer,
    t3teamAtlassianAssetRouteLayer,
    t3teamAtlassianBacklogRouteLayer,
    t3teamAtlassianConnectBasicRouteLayer,
    t3teamAtlassianConnectOAuthRouteLayer,
    t3teamAtlassianDisconnectRouteLayer,
    t3teamAtlassianIssueContentRouteLayer,
    t3teamAtlassianMyWorkRouteLayer,
    t3teamAtlassianOAuthBeginRouteLayer,
    t3teamAtlassianOAuthExchangeRouteLayer,
    t3teamAtlassianProjectIssuesRouteLayer,
    t3teamAtlassianProjectsRouteLayer,
    t3teamAtlassianResourceRouteLayer,
    t3teamAtlassianResourcesRouteLayer,
    t3teamNexiUpdateRouteLayer,
    t3teamTempoRouteLayer,
  ).pipe(Layer.provide(t3teamRouteAuthLayer)),
  Layer.mergeAll(
    t3teamGitHubAssetRouteLayer,
    t3teamGitHubInboxRouteLayer,
    t3teamGitHubPullRequestContextRouteLayer,
    t3teamProjectWorkspaceBootstrapRouteLayer,
    t3teamProjectMainRepositoryRouteLayer,
    t3teamStateMigrationResumeLayer,
    t3teamProjectWorkspaceDiscoverRecipesRouteLayer,
    t3teamProjectWorkspaceWriteContextFilesRouteLayer,
    t3teamProjectWorkspaceRefreshProjectContextRouteLayer,
    t3teamProjectWorkspaceRefreshWorkItemContextRouteLayer,
    t3teamProjectWorkspaceRefreshWorkItemSliceContextRouteLayer,
    t3teamThreadRecipeWorkflowLaunchRouteLayer,
    t3teamRecipeHeadlessLaunchRouteLayer,
    t3teamRecipeTriggerStatusRouteLayer,
    t3teamThreadWorkflowControlRouteLayer,
    t3teamThreadJobsRouteLayer,
    t3teamThreadDraftMutationStatusRouteLayer,
    t3teamThreadWorkflowResolveInputRouteLayer,
    t3teamThreadToolContextRouteLayer,
    t3teamThreadPlacementRouteLayer,
    t3teamMyWorkDigestRouteLayer,
    t3teamWidgetToolCallRouteLayer,
    t3teamVoiceRouteLayer,
  ).pipe(Layer.provide(t3teamRouteAuthLayer)),
  McpHttpServer.layer.pipe(
    Layer.provide(ProviderAdapterRegistry.layerFromProviderInstanceRegistry),
    // t3team: delegate_task workspace isolation + extensions (DelegatedTaskPreparation hook).
    Layer.provide(
      T3TeamDelegatedTaskPreparationLive.pipe(Layer.provide(T3TeamDelegateCloudSessionsLayer)),
    ),
    // t3team: t3_thread_send mode "mailbox" (shared inter-agent mailbox instance).
    Layer.provide(T3TeamThreadMailboxDeliveryLive),
    // t3team: t3_machine_find_definitions searches the project's repositories for machine definitions.
    Layer.provide(MachineDefinitionFinderLayer),
    // t3team: t3_machine_set_source proves a proposed machine source before the user is asked.
    Layer.provide(MachineSourceProposalLayer),
    Layer.provide(McpOAuth.layerMcpClientAuthenticator),
  ),
  // Follows delegated tasks running in linked environments, including after a restart.
  Layer.effectDiscard(
    RemoteDelegation.RemoteDelegation.pipe(Effect.flatMap((remote) => remote.start())),
  ),
).pipe(
  Layer.provide(
    PullRequestReviewGuideService.layer.pipe(Layer.provide(PullRequestReviewGuides.layer)),
  ),
  // delegate_task to a linked environment, from /mcp and the follower above.
  Layer.provide(RemoteDelegation.layer.pipe(Layer.provide(ProjectionStoreV2.layer))),
  // Links agents ask for: shown in a thread from /mcp, answered over WebSocket.
  Layer.provide(PeerLinkRequests.layer),
  // Share the service so HTTP/WS clients single-flight reads and invalidate each other's cached patches.
  Layer.provide(layerPullRequestService),
  // The same activity instance RunExecutionService reports to, by layer memoization.
  Layer.provide(
    ServerBrowser.layer.pipe(
      Layer.provide(Layer.merge(DesktopBrowserChannel.layer, PreviewAgentActivity.layer)),
    ),
  ),
  Layer.provide(PreviewBrowser.layer),
  // Links to other environments, shared by Settings (WebSocket) and agents (/mcp).
  Layer.provide(
    PeerForwarding.layer.pipe(
      Layer.provideMerge(PeerMcpClient.layer),
      Layer.provideMerge(PeerLinks.layer),
    ),
  ),
  Layer.provide(PreviewAutomationBroker.layer),
  Layer.provide(ServerSelfUpdate.layer.pipe(Layer.provide(layerDesktopAppUpdate))),
  Layer.provide(layerCommandReadiness),
  Layer.provide(ServerHttp.layerBrowserApiCors),
  Layer.provide(ServerHttp.layerHttpCompression),
);

class ServerDistributionActivationError extends Schema.TaggedError<ServerDistributionActivationError>()(
  "ServerDistributionActivationError",
  { cause: Schema.Unknown },
) {
  override get message(): string {
    return `Compiled-in distribution activation failed: ${String(this.cause)}`;
  }
}

const layerMakeServer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    // Before anything opens the database: one server per T3 home.
    const ownership = yield* ServerOwnership.acquireServerOwnership(config.serverRuntimeStatePath);
    const activation = yield* Deferred.make<void>();
    const awaitActivation = Deferred.await(activation);
    const layerActivation = Layer.succeed(ServerActivation.ServerActivation, awaitActivation);
    const runtimeStateParked = yield* Deferred.make<void>();
    const tailscaleParked = yield* Deferred.make<void>();
    const cloudLinkParked = yield* Deferred.make<void>();
    const routesReady = yield* Deferred.make<void>();
    const layerLauncher = ServiceLauncherClient.layer;

    yield* fixPath({ shellEnvironmentPrepared: config.shellEnvironmentPrepared });

    // Activate the compiled-in distribution before any layers are built so the
    // appearance, branding, and provider overlays are available to
    // ServerEnvironment and every other service.
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

    // Recipes of the pack on disk (T3TEAM_PACKS_DIR), for a host that compiles its distribution in.
    yield* activatePackRecipeSources;

    // Survive unawaited @cursor/sdk writes after their stream closed (was a backend crash).
    yield* installProcessResilience;

    const layerHttpListening = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* HttpServer.HttpServer;
        const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
        yield* startup.markHttpListening;
        yield* startHostServices;
      }),
    );
    const layerRuntimeState = Layer.effectDiscard(
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
        yield* ownership
          .publish(state)
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to persist server runtime state", { cause }),
            ),
          );
      }),
    );
    const layerTailscaleServe = config.tailscaleServeEnabled
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
                localHost: loopbackUrlHostForAddress(address),
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
    const layerCloudDesiredLinkReconcile = Layer.effectDiscard(
      Effect.gen(function* () {
        const cloudLink = yield* CloudLink.CloudLink;
        const releaseManagedTunnel = cloudLink.releaseManagedTunnelOnShutdown().pipe(
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
        // Trials own cleanup immediately after the old server exits, retaining tunnels for commit/rollback unless explicitly stopped.
        // Other runtimes wait for activation so failed standbys cannot tear down active tunnels.
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
            const localOrigin = `http://${loopbackUrlHostForAddress(address)}:${address.port}`;
            const endpointRuntime = yield* CloudManagedEndpointRuntime.CloudManagedEndpointRuntime;
            const runManagedTunnelRecovery = yield* makeManagedTunnelRecovery({
              recover: (config: RelayManagedEndpointRuntimeConfig) =>
                cloudLink.recoverManagedTunnel(localOrigin, config, {
                  retryRuntimeFailures: true,
                }),
              isRetryable: (error) =>
                CloudLink.shouldRetryCloudLink(error) &&
                error._tag !== "CloudLinkEndpointUnavailableError",
            });
            const recoverManagedTunnel = (config: RelayManagedEndpointRuntimeConfig) =>
              runManagedTunnelRecovery(config).pipe(
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
              );
            yield* endpointRuntime.recoveryRequests.pipe(
              Stream.runForEach(recoverManagedTunnel),
              Effect.forkScoped,
            );
            const wantsCliLink = hasCloudPublicConfig
              ? yield* CloudCliState.readCliDesiredCloudLink.pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("Failed to read the desired T3 Connect link", { cause }).pipe(
                      Effect.as(false),
                    ),
                  ),
                )
              : false;
            // Recover reads so this fiber still registers and consumes recovery requests.
            const desiredCliLinkMode = wantsCliLink
              ? yield* CloudCliState.readCliDesiredLinkMode.pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("Failed to read the desired T3 Connect link mode", {
                      cause,
                    }).pipe(Effect.as("managed" as const)),
                  ),
                )
              : null;
            // Publish-only links must not expose the host through old managed configs.
            const startedConfirmed =
              desiredCliLinkMode === "publish_only"
                ? false
                : yield* cloudLink.startManagedTunnelIfOriginConfirmed(localOrigin).pipe(
                    Effect.catch((cause) =>
                      Effect.logWarning("Failed to start the confirmed T3 Connect tunnel", {
                        cause,
                      }).pipe(Effect.as(false)),
                    ),
                  );
            const startStoredManagedTunnel = cloudLink
              .startManagedTunnelIfOriginConfirmed(localOrigin, {
                requireConfirmedOrigin: false,
              })
              .pipe(
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
              cloudLink.registerManagedTunnelRecovery(localOrigin, {
                retryRuntimeFailures: true,
              }),
              (error) =>
                CloudLink.shouldRetryCloudLink(error) &&
                error._tag !== "CloudLinkEndpointUnavailableError",
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
            // Jitter registrations so update waves do not hit the relay simultaneously.
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
            if (registration.status === "unavailable" && !startedConfirmed) {
              yield* startStoredManagedTunnel;
            }
            const startupAction = managedTunnelStartupAction({ wantsCliLink, registration });
            if (startupAction.action === "request_recovery") {
              yield* endpointRuntime.requestRecovery(startupAction.config);
            }
            if (startupAction.action === "reconcile_link") {
              const reconciledMode = yield* cloudLink
                .reconcileDesiredLinkIfStillDesired(localOrigin)
                .pipe(
                  (reconcile) =>
                    retryDesiredLinkReconcile(reconcile, CloudLink.shouldRetryCloudLink, (cause) =>
                      Effect.logWarning(
                        "T3 Connect relay is still unavailable; retrying the desired link in the background",
                        { cause },
                      ),
                    ),
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
        // Keep the per-user T3 Connect credential refreshed in the background.
        // It never opens a browser: a missing credential is only reported to the
        // UI (ConnectSignInPrompt), which offers a dismissible sign-in notice.
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

    const layerRuntimeServices = ServerRuntimeStartup.layerWithOptions({
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
    }).pipe(Layer.provideMerge(layerRuntimeDependencies), Layer.provide(layerLauncher));

    const layerRoutes = HttpRouter.serve(layerMakeRoutes.pipe(Layer.provide(layerLauncher)), {
      disableLogger: !config.logWebSocketEvents,
      routerConfig: HTTP_ROUTER_CONFIG,
    }).pipe(
      withUntracedRequests,
      Layer.tap(() => Deferred.succeed(routesReady, undefined).pipe(Effect.orDie)),
    );
    const layerServerApplication = Layer.mergeAll(
      layerRoutes,
      layerHttpListening,
      layerRuntimeState.pipe(Layer.provide(layerLauncher)),
      layerTailscaleServe,
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
            Layer.provide(GitHubApi.layerWithDependencies),
            Layer.provide(ProjectMachineDiscoveryLayer),
          ),
        ),
      ),
      T3TeamThreadSilenceWatchReactorLive,
      T3TeamThreadTransientTurnRetryLive,
      T3TeamWorkflowEngineRehydrateLive,
      // t3team: a recipe the first user message on the bootstrap thread starts (T3CODE_KICKOFF_RECIPE).
      T3TeamKickoffRecipeLive,
      layerCloudDesiredLinkReconcile,
      HeapSnapshot.layer,
      // t3team: CPU profiles of event-loop stalls, behind OPS_STALL_PROFILER (startup-only).
      T3TeamStallProfilerLive,
    );

    return layerServerApplication.pipe(
      Layer.provide(CloudLink.layer.pipe(Layer.provideMerge(ConnectReachability.layer))),
      // loadPullRequestContext (behind t3teamGitHubPullRequestContextRouteLayer, inside
      // layerMakeRoutes) now requires PullRequestService directly. layerMakeRoutes already
      // provides layerPullRequestService to the routes merged there, but that provision does
      // not reach the requirement HttpRouter.serve's own effect carries at this outer level —
      // so it is provided again here, ahead of the rest of this pipe. The pr-context route's
      // own project resolver also reads PullRequestProviderRegistry directly, same story.
      Layer.provide(layerPullRequestService),
      // t3team: recipe scripts' `ctx.store` / `ctx.changeRequests`, for the recipe launch route
      // (served at this level, like the PR context route above) and boot rehydration.
      Layer.provide(T3TeamScriptHost.layer.pipe(Layer.provide(layerPullRequestService))),
      // t3team: background linked-repository clones/fetches, shared by the workspace bootstrap and
      // linked-repository status routes (served at this level, like the PR context route above).
      Layer.provide(T3TeamLinkedRepositorySyncLive),
      Layer.provide(PullRequestProviderRegistry.layer),
      Layer.provideMerge(layerRuntimeServices),
      Layer.provideMerge(
        McpSessionRegistry.layer.pipe(
          Layer.provide(ServerEnvironment.layer.pipe(Layer.provide(ServerSecretStore.layer))),
        ),
      ),
      Layer.provide(layerActivation),
      Layer.provideMerge(RelayTracing.layerServerRelayBroker),
      Layer.provideMerge(layerHttpServer),
      Layer.provide(layerApplicationObservability),
      Layer.provideMerge(FetchHttpClient.layer),
      Layer.provide(VcsProcess.layer),
      Layer.provideMerge(AgentScopeLive.layer),
      Layer.provideMerge(layerPlatformServices),
    );
  }),
).pipe(Layer.provide(ProcessRunner.layer));

export const runServer = Layer.launch(layerMakeServer);
