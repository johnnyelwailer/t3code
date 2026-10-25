/**
 * The services the WebSocket RPC handlers in `ws.ts` need, written out once.
 *
 * `layerWsRpc` is annotated with this union so a module that imports the server graph (the CLI
 * and its tests) reads a declared type instead of re-inferring `WsRpcGroup.toLayer` over every
 * handler. That inference crossed the checker's instantiation budget and surfaced as `any` in
 * the requirements channel. A handler that needs a new service fails the annotation in `ws.ts`;
 * add the service here.
 * @module t3team-wsRpcServices
 */
import type * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import type * as PairingGrantStore from "./auth/PairingGrantStore.ts";
import type * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import type * as SessionStore from "./auth/SessionStore.ts";
import type * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import type * as CheckpointDiffQuery from "./checkpointing/CheckpointDiffQuery.ts";
import type * as ServerSelfUpdate from "./cloud/selfUpdate.ts";
import type * as ServerConfig from "./config.ts";
import type * as DeviceService from "./device/DeviceService.ts";
import type * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import type * as ProcessResourceMonitor from "./diagnostics/ProcessResourceMonitor.ts";
import type * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import type * as DirectEndpoints from "./environment/DirectEndpoints.ts";
import type * as RemoteOpenTargets from "./environment/RemoteOpenTargets.ts";
import type * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import type * as EnvironmentTheme from "./environmentTheme.ts";
import type * as GitWorkflowService from "./git/GitWorkflowService.ts";
import type * as Keybindings from "./keybindings.ts";
import type * as McpAppRequests from "./mcpApps/McpAppRequests.ts";
import type * as OtlpEndpointCheck from "./observability/OtlpEndpointCheck.ts";
import type * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import type * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import type * as ProviderSessionManager from "./orchestration-v2/ProviderSessionManager.ts";
import type * as PullRequestSyncReactor from "./orchestration-v2/PullRequestSyncReactor.ts";
import type * as ThreadLaunchService from "./orchestration-v2/ThreadLaunchService.ts";
import type * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import type * as CommandOutputHub from "./orchestration-v2/CommandOutputHub.ts";
import type * as ThreadSearch from "./orchestration-v2/ThreadSearch.ts";
import type * as OrchestrationEventStore from "./persistence/OrchestrationEventStore.ts";
import type * as PreviewManager from "./preview/Manager.ts";
import type * as PortScanner from "./preview/PortScanner.ts";
import type * as ExternalLauncher from "./process/externalLauncher.ts";
import type * as AgentSessionImporter from "./project/AgentSessionImporter.ts";
import type * as AgentSessionScanner from "./project/AgentSessionScanner.ts";
import type * as ManagedProjectFolders from "./project/ManagedProjectFolders.ts";
import type * as ProjectCloneTracker from "./project/ProjectCloneTracker.ts";
import type * as ProjectEnrichmentService from "./project/ProjectEnrichmentService.ts";
import type * as ProjectFaviconResolver from "./project/ProjectFaviconResolver.ts";
import type * as ProjectService from "./project/ProjectService.ts";
import type * as ProjectSetupScriptRunner from "./project/ProjectSetupScriptRunner.ts";
import type * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import type * as WorktreeSetupTracker from "./project/WorktreeSetupTracker.ts";
import type * as AntigravityInstallation from "./provider/AntigravityInstallation.ts";
import type * as CodexInstallation from "./provider/CodexInstallation.ts";
import type * as ModelManifest from "./provider/ModelManifest.ts";
import type * as ProviderAuthService from "./provider/ProviderAuthService.ts";
import type * as ProviderInstanceRegistry from "./provider/ProviderInstanceRegistry.ts";
import type * as ProviderRegistry from "./provider/ProviderRegistry.ts";
import type * as ProviderMaintenanceRunner from "./provider/providerMaintenanceRunner.ts";
import type * as PullRequestReviewGuideService from "./pullRequest/PullRequestReviewGuideService.ts";
import type * as PullRequestService from "./pullRequest/PullRequestService.ts";
import type * as GuestShareService from "./guest/GuestShareService.ts";
import type * as HostResources from "./resourceTelemetry/HostResources.ts";
import type * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import type * as ReviewService from "./review/ReviewService.ts";
import type * as ScheduledTasks from "./scheduledTasks/ScheduledTaskService.ts";
import type * as SecretRequests from "./secrets/SecretRequests.ts";
import type * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import type * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import type * as ServerSettings from "./serverSettings.ts";
import type * as SourceControlDiscovery from "./sourceControl/SourceControlDiscovery.ts";
import type * as SourceControlRepositoryService from "./sourceControl/SourceControlRepositoryService.ts";
import type * as StorageCleanup from "./storageCleanup.ts";
import type * as AnalyticsService from "./telemetry/AnalyticsService.ts";
import type * as TerminalManager from "./terminal/Manager.ts";
import type * as DatabaseStorage from "./persistence/DatabaseStorage.ts";
import type * as ToolAuthService from "./toolauth/t3team-ToolAuthService.ts";
import type * as UsageLimitSources from "./usage/UsageLimitSources.ts";
import type * as UsageService from "./usage/UsageService.ts";
import type * as VcsProvisioningService from "./vcs/VcsProvisioningService.ts";
import type * as VcsStatusBroadcaster from "./vcs/VcsStatusBroadcaster.ts";
import type * as WorkspaceEntries from "./workspace/WorkspaceEntries.ts";
import type * as WorkspaceFileSystem from "./workspace/WorkspaceFileSystem.ts";
import type * as WorkspacePaths from "./workspace/WorkspacePaths.ts";
import type * as AcpRegistryRuntimeCoordinator from "@t3tools/provider-acp-registry/server/AcpRegistryRuntimeCoordinator";
import type * as AcpRegistrySupport from "@t3tools/provider-acp-registry/server/AcpRegistrySupport";
import type * as ProviderLatestVersions from "@t3tools/provider-core/server/ProviderLatestVersions";
import type * as RelayClient from "@t3tools/shared/relayClient";
import type * as Crypto from "effect/Crypto";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as SqlClient from "effect/sql/SqlClient";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import type { CloudSessionService } from "./cloud/t3team-CloudSessionService.ts";
import type { ProjectMachineDiscovery } from "./project/t3team-ProjectMachineDiscovery.ts";
import type { ResourcePressureMonitor } from "./t3team-resourcePressureMonitor.ts";
import type { FeatureFlags } from "./t3team-FeatureFlags.ts";

export type WsRpcHandlerServices =
  | AcpRegistrySupport.AcpRegistryCatalog
  | AcpRegistryRuntimeCoordinator.AcpRegistryRuntimeCoordinator
  | AgentSessionImporter.AgentSessionImporter
  | AgentSessionScanner.AgentSessionScanner
  | AnalyticsService.AnalyticsService
  | AntigravityInstallation.AntigravityInstallation
  | BackgroundPolicy.BackgroundPolicy
  | CheckpointDiffQuery.CheckpointDiffQuery
  | ChildProcessSpawner.ChildProcessSpawner
  | CloudSessionService
  | CodexInstallation.CodexInstallation
  | CommandOutputHub.CommandOutputHub
  | Crypto.Crypto
  | DatabaseStorage.DatabaseStorage
  | DeviceService.DeviceService
  | DirectEndpoints.DirectEndpoints
  | EnvironmentAuth.EnvironmentAuth
  | EnvironmentTheme.EnvironmentThemeService
  | ExternalLauncher.ExternalLauncher
  | FileSystem.FileSystem
  | GitWorkflowService.GitWorkflowService
  | HostResources.HostResources
  | Keybindings.Keybindings
  | ManagedProjectFolders.ManagedProjectFolders
  | McpAppRequests.McpAppRequests
  | ModelManifest.ModelManifest
  | OrchestrationEventStore.OrchestrationEventStore
  | Orchestrator.OrchestratorV2
  | OtlpEndpointCheck.OtlpEndpointCheck
  | PairingGrantStore.PairingGrantStore
  | Path.Path
  | PortScanner.PortDiscovery
  | PreviewManager.PreviewManager
  | ProcessDiagnostics.ProcessDiagnostics
  | ProcessResourceMonitor.ProcessResourceMonitor
  | ProjectCloneTracker.ProjectCloneTracker
  | ProjectEnrichmentService.ProjectEnrichmentService
  | ProjectFaviconResolver.ProjectFaviconResolver
  | ProjectMachineDiscovery
  | ProjectService.ProjectService
  | ProjectSetupScriptRunner.ProjectSetupScriptRunner
  | ProjectStore.ProjectStoreV2
  | ProviderAuthService.ProviderAuthService
  | ProviderInstanceRegistry.ProviderInstanceRegistry
  | ProviderLatestVersions.ProviderLatestVersions
  | ProviderMaintenanceRunner.ProviderMaintenanceRunner
  | ProviderRegistry.ProviderRegistry
  | ProviderSessionManager.ProviderSessionManagerV2
  | PullRequestReviewGuideService.PullRequestReviewGuideService
  | PullRequestService.PullRequestService
  | GuestShareService.GuestShareService
  | PullRequestSyncReactor.PullRequestSyncReactor
  | RelayClient.RelayClient
  | RemoteOpenTargets.RemoteOpenTargets
  | RepositoryIdentityResolver.RepositoryIdentityResolver
  | ResourcePressureMonitor
  | FeatureFlags
  | ResourceTelemetry.ResourceTelemetry
  | ReviewService.ReviewService
  | ScheduledTasks.ScheduledTaskService
  | SecretRequests.SecretRequests
  | ServerConfig.ServerConfig
  | ServerEnvironment.ServerEnvironment
  | ServerLifecycleEvents.ServerLifecycleEvents
  | ServerRuntimeStartup.ServerRuntimeStartup
  | ServerSecretStore.ServerSecretStore
  | ServerSelfUpdate.ServerSelfUpdate
  | ServerSettings.ServerSettingsService
  | SessionStore.SessionStore
  | SourceControlDiscovery.SourceControlDiscovery
  | SourceControlRepositoryService.SourceControlRepositoryService
  | SqlClient.SqlClient
  | StorageCleanup.StorageCleanup
  | TerminalManager.TerminalManager
  | ThreadLaunchService.ThreadLaunchService
  | ThreadManagementService.ThreadManagementService
  | ThreadSearch.ThreadSearch
  | ToolAuthService.ToolAuthService
  | TraceDiagnostics.TraceDiagnostics
  | UsageLimitSources.UsageLimitSources
  | UsageService.UsageService
  | VcsProvisioningService.VcsProvisioningService
  | VcsStatusBroadcaster.VcsStatusBroadcaster
  | WorkspaceEntries.WorkspaceEntries
  | WorkspaceFileSystem.WorkspaceFileSystem
  | WorkspacePaths.WorkspacePaths
  | WorktreeSetupTracker.WorktreeSetupTracker;
