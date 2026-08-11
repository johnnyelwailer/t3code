import { EnvironmentHttpApi } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import * as HostPowerMonitor from "./background/HostPowerMonitor.ts";
import * as ServerConfig from "./config.ts";
import {
  otlpTracesProxyRouteLayer,
  assetRouteLayer,
  serverEnvironmentHttpApiLayer,
  staticAndDevRouteLayer,
  browserApiCorsLayer,
  httpCompressionLayer,
} from "./http.ts";
import { fixPath } from "./os-jank.ts";
import { websocketRpcRouteLayer } from "./ws.ts";
import * as ExternalLauncher from "./process/externalLauncher.ts";
import { pullRequestHttpApiLayer } from "./pullRequest/http.ts";
import * as PullRequestProviderRegistry from "./pullRequest/PullRequestProviderRegistry.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
import { layerConfig as SqlitePersistenceLayerLive } from "./persistence/Layers/Sqlite.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as AnalyticsService from "./telemetry/AnalyticsService.ts";
import { ProviderSessionDirectoryLive } from "./provider/Layers/ProviderSessionDirectory.ts";
import * as ProviderSessionRuntime from "./persistence/ProviderSessionRuntime.ts";
import { ProviderAdapterRegistryLive } from "./provider/Layers/ProviderAdapterRegistry.ts";
import * as ProviderEventLoggers from "./provider/Layers/ProviderEventLoggers.ts";
import { ProviderServiceLive } from "./provider/Layers/ProviderService.ts";
import { ProviderSessionReaperLive } from "./provider/Layers/ProviderSessionReaper.ts";
import { localProviderSessionsRouteLayer } from "./t3team-localProviderSessions-routes.ts";
import { LocalProviderSessionsWatcherLive } from "./t3team-localProviderSessionsWatcher.ts";
import * as OpenCodeRuntime from "./provider/opencodeRuntime.ts";
import * as CheckpointDiffQuery from "./checkpointing/CheckpointDiffQuery.ts";
import * as CheckpointStore from "./checkpointing/CheckpointStore.ts";
import * as AzureDevOpsCli from "./sourceControl/AzureDevOpsCli.ts";
import * as BitbucketApi from "./sourceControl/BitbucketApi.ts";
import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import * as GitLabCli from "./sourceControl/GitLabCli.ts";
import * as TextGeneration from "./textGeneration/TextGeneration.ts";
import { ProviderInstanceRegistryHydrationLive } from "./provider/Layers/ProviderInstanceRegistryHydration.ts";
import * as TerminalManager from "./terminal/Manager.ts";
import * as McpHttpServer from "./mcp/McpHttpServer.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "./mcp/PreviewAutomationBroker.ts";
import * as PreviewManager from "./preview/Manager.ts";
import * as PortScanner from "./preview/PortScanner.ts";
import * as ProcessRunner from "./processRunner.ts";
import * as GitManager from "./git/GitManager.ts";
import * as Keybindings from "./keybindings.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import { OrchestrationReactorLive } from "./orchestration/Layers/OrchestrationReactor.ts";
import { RuntimeReceiptBusLive } from "./orchestration/Layers/RuntimeReceiptBus.ts";
import { ProviderRuntimeIngestionLive } from "./orchestration/Layers/ProviderRuntimeIngestion.ts";
import { ProviderCommandReactorLive } from "./orchestration/Layers/ProviderCommandReactor.ts";
import { CheckpointReactorLive } from "./orchestration/Layers/CheckpointReactor.ts";
import { ThreadDeletionReactorLive } from "./orchestration/Layers/ThreadDeletionReactor.ts";
import * as AgentAwarenessRelay from "./relay/AgentAwarenessRelay.ts";
import { hasCloudPublicConfig } from "./cloud/publicConfig.ts";
import { ProviderRegistryLive } from "./provider/Layers/ProviderRegistry.ts";
import * as ServerSettings from "./serverSettings.ts";
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
import * as GitWorkflowService from "./git/GitWorkflowService.ts";
import * as ReviewService from "./review/ReviewService.ts";
import * as SourceControlProviderRegistry from "./sourceControl/SourceControlProviderRegistry.ts";
import * as SourceControlRepositoryService from "./sourceControl/SourceControlRepositoryService.ts";
import * as ProjectSetupScriptRunner from "./project/ProjectSetupScriptRunner.ts";
import { ObservabilityLive } from "./observability/Layers/Observability.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import { authHttpApiLayer, environmentAuthenticatedAuthLayer } from "./auth/http.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import {
  connectHttpApiLayer,
  pendingServiceUpdateExists,
  reconcileDesiredCloudLink,
  releaseManagedTunnelOnShutdown,
} from "./cloud/http.ts";
import { serverRelayBrokerTracingLayer } from "./cloud/relayTracing.ts";
import * as CloudManagedEndpointRuntime from "./cloud/ManagedEndpointRuntime.ts";
import * as CloudCliTokenManager from "./cloud/CliTokenManager.ts";
import * as CloudCliState from "./cloud/CliState.ts";
import * as ServerSelfUpdate from "./cloud/selfUpdate.ts";
import * as ServiceLauncherClient from "./cloud/serviceLauncherClient.ts";
import * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import * as ProcessResourceMonitor from "./diagnostics/ProcessResourceMonitor.ts";
import * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import * as DesktopTelemetryReceiver from "./resourceTelemetry/DesktopTelemetryReceiver.ts";
import * as NativeTelemetryClient from "./resourceTelemetry/NativeTelemetryClient.ts";
import * as ResourceAttribution from "./resourceTelemetry/ResourceAttribution.ts";
import * as ResourceMonitorBinary from "./resourceTelemetry/ResourceMonitorBinary.ts";
import * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import * as UsageService from "./usage/UsageService.ts";
import { OrchestrationLayerLive } from "./orchestration/runtimeLayer.ts";
import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
} from "./serverRuntimeState.ts";
import { orchestrationHttpApiLayer } from "./orchestration/http.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import * as ToolAuthService from "./toolauth/t3team-ToolAuthService.ts";
import { T3TeamThreadToolContextEvictionReactorLive } from "./t3team-threadToolContextEvictionReactor.ts";
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
import { t3teamAtlassianOAuthFlowRouteLayer } from "./t3team-atlassian-oauth-flowRoutes.ts";
import { t3teamTempoRouteLayer } from "./t3team-tempo-routes.ts";
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
import { t3teamThreadWorkflowControlRouteLayer } from "./t3team-thread-workflow-control-route.ts";
import {
  t3teamGitHubAssetRouteLayer,
  t3teamGitHubInboxRouteLayer,
  t3teamGitHubPullRequestContextRouteLayer,
} from "./t3team-github-routes.ts";
import { t3teamProjectWorkspaceBootstrapRouteLayer } from "./t3team-project-repository-routes.ts";
import { t3teamThreadPlacementRouteLayer } from "./t3team-thread-placement-routes.ts";
import { t3teamThreadToolContextRouteLayer } from "./t3team-thread-tool-context-routes.ts";
import { T3TeamThreadToolContextStoreLive } from "./t3team-threadToolContextStore.ts";
import { t3teamWidgetToolCallRouteLayer } from "./t3team-widget-tool-call-route.ts";
import { T3TeamWidgetRegistryLive } from "./t3team-widgetRegistry.ts";
import { T3TeamContextRefreshServiceLive } from "./t3team-contextRefreshService.ts";
import { T3TeamWorkflowEngineReactorLive } from "./t3team-workflowEngineReactor.ts";
import { T3TeamActorMessageReactorLive } from "./t3team-actorMessageReactor.ts";
import { T3TeamThreadStopCascadeReactorLive } from "./t3team-threadStopCascadeReactor.ts";
import { T3TeamChildStatusReactorLive } from "./t3team-childStatusReactor.ts";
import { T3TeamWorkflowEngineRehydrateLive } from "./t3team-workflowEngineRehydrate.ts";
import { T3TeamWorkflowEngineRegistryLive } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import { T3TeamToolBrokerLive } from "./t3team-toolBrokerLive.ts";
import * as NetService from "@t3tools/shared/Net";
import * as RelayClient from "@t3tools/shared/relayClient";
import { disableTailscaleServe, ensureTailscaleServe } from "@t3tools/tailscale";
import { forkParked, ServerActivation } from "./serverActivation.ts";

// Effect's default preemptive shutdown waits 20s before finalizing request scopes.
// T3's primary transport is long-lived WebSocket RPC, whose Effect scope finalizer
// already closes the websocket gracefully. Do not add an artificial drain before
// those finalizers get a chance to run.
const HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS = 0;
const ResourceAttributionLayerLive = ResourceAttribution.layer;
const ApplicationObservabilityLive = ObservabilityLive.pipe(
  Layer.provideMerge(ResourceAttributionLayerLive),
);

const PtyAdapterLive = Layer.unwrap(
  Effect.gen(function* () {
    if (typeof Bun !== "undefined") {
      const BunPtyAdapter = yield* Effect.promise(() => import("./terminal/BunPtyAdapter.ts"));
      return BunPtyAdapter.layer;
    } else {
      const NodePtyAdapter = yield* Effect.promise(() => import("./terminal/NodePtyAdapter.ts"));
      return NodePtyAdapter.layer;
    }
  }),
);

const ServerSettingsLayerLive = ServerSettings.layer.pipe(Layer.provide(ServerSecretStore.layer));

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

const BackgroundLayerLive = BackgroundPolicy.layer.pipe(
  Layer.provide(HostPowerMonitorLayerLive),
  Layer.provideMerge(ServerSettingsLayerLive),
);

const UsageLayerLive = UsageService.layer.pipe(Layer.provide(ServerSettingsLayerLive));

const ResourceDiagnosticsLayerLive = Layer.mergeAll(
  ResourceTelemetryLayerLive,
  ProcessDiagnostics.layer.pipe(Layer.provide(ResourceTelemetryLayerLive)),
  ProcessResourceMonitor.layer.pipe(Layer.provide(ResourceTelemetryLayerLive)),
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
    if (typeof Bun !== "undefined") {
      const BunHttpServer = yield* Effect.promise(
        () => import("@effect/platform-bun/BunHttpServer"),
      );
      return BunHttpServer.layer({
        port: config.port,
        hostname: config.host ?? "127.0.0.1",
        gracefulShutdownTimeout: HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS,
        websocket: {
          // Negotiate permessage-deflate with clients that offer it; clients
          // that don't still get uncompressed frames on their connection. A
          // dedicated compressor keeps a per-connection sliding window
          // (context takeover) so the compression dictionary is shared across
          // server-to-client frames. Decompression uses the shared
          // decompressor: uWebSockets' dedicated decompressor path can abort
          // connections (close 1006) on valid DEFLATE input — see
          // https://github.com/uNetworking/uWebSockets.js/issues/633.
          perMessageDeflate: {
            compress: "dedicated",
            decompress: "shared",
          },
        },
      });
    } else {
      const [NodeHttpServer, NodeHttp] = yield* Effect.all([
        Effect.promise(() => import("@effect/platform-node/NodeHttpServer")),
        Effect.promise(() => import("node:http")),
      ]);
      return NodeHttpServer.layer(NodeHttp.createServer, {
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
    }
  }),
);

const PlatformServicesLive = Layer.unwrap(
  Effect.gen(function* () {
    if (typeof Bun !== "undefined") {
      const { layer } = yield* Effect.promise(() => import("@effect/platform-bun/BunServices"));
      return layer;
    } else {
      const { layer } = yield* Effect.promise(() => import("@effect/platform-node/NodeServices"));
      return layer;
    }
  }),
);

const ReactorLayerLive = Layer.empty.pipe(
  Layer.provideMerge(OrchestrationReactorLive),
  Layer.provideMerge(ProviderRuntimeIngestionLive),
  Layer.provideMerge(ProviderCommandReactorLive),
  Layer.provideMerge(CheckpointReactorLive),
  Layer.provideMerge(ThreadDeletionReactorLive),
  Layer.provideMerge(T3TeamThreadToolContextEvictionReactorLive),
  Layer.provideMerge(AgentAwarenessRelay.layer.pipe(Layer.provide(ServerSecretStore.layer))),
  Layer.provideMerge(RuntimeReceiptBusLive),
);

const ProviderSessionDirectoryLayerLive = ProviderSessionDirectoryLive.pipe(
  Layer.provide(ProviderSessionRuntime.layer),
);

// `ProviderAdapterRegistryLive` is now a facade that resolves kind → adapter
// by looking up the default `ProviderInstance` per driver in the instance
// registry. Adapter construction itself moved inside each driver's
// `create()`; `ProviderEventLoggers.layer` owns the shared native/canonical
// NDJSON writers and is provided at the outer runtime layer so both
// `ProviderService` and the per-instance drivers read the same logger pair.
const ProviderLayerLive = ProviderServiceLive.pipe(
  Layer.provide(ProviderAdapterRegistryLive),
  Layer.provideMerge(ProviderSessionDirectoryLayerLive),
);

const PersistenceLayerLive = Layer.empty.pipe(Layer.provideMerge(SqlitePersistenceLayerLive));

const VcsDriverRegistryLayerLive = VcsDriverRegistry.layer.pipe(
  Layer.provide(VcsProjectConfig.layer),
);

const SourceControlProviderRegistryLayerLive = SourceControlProviderRegistry.layer.pipe(
  Layer.provide(
    Layer.mergeAll(AzureDevOpsCli.layer, BitbucketApi.layer, GitHubCli.layer, GitLabCli.layer),
  ),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(VcsDriverRegistryLayerLive),
);

const GitManagerLayerLive = GitManager.layer.pipe(
  Layer.provideMerge(ProjectSetupScriptRunner.layer),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(SourceControlProviderRegistryLayerLive),
  Layer.provideMerge(TextGeneration.layer),
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
  Layer.provideMerge(VcsStatusBroadcaster.layer.pipe(Layer.provide(GitWorkflowLayerLive))),
);

const CheckpointingLayerLive = Layer.empty.pipe(
  Layer.provideMerge(CheckpointDiffQuery.layer),
  Layer.provideMerge(CheckpointStore.layer.pipe(Layer.provide(VcsDriverRegistryLayerLive))),
);

const PortScannerLayerLive = PortScanner.layer.pipe(Layer.provide(ProcessRunner.layer));

const TerminalLayerLive = TerminalManager.layer.pipe(
  Layer.provide(PtyAdapterLive),
  Layer.provide(PortScannerLayerLive),
);

// "Connected tools" sign-in flows. Reuses the same real pty service the
// terminal does — see apps/server/src/toolauth/t3team-ToolAuthService.ts.
const ToolAuthLayerLive = ToolAuthService.layer.pipe(Layer.provide(PtyAdapterLive));

const PreviewLayerLive = Layer.empty.pipe(
  Layer.provideMerge(PreviewManager.layer),
  Layer.provideMerge(PortScannerLayerLive),
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

const AuthLayerLive = EnvironmentAuth.layer.pipe(
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provide(ServerSecretStore.layer),
);

const CloudManagedEndpointRuntimeLive = Layer.mergeAll(
  RelayClientLive,
  CloudManagedEndpointRuntime.layer.pipe(
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(RelayClientLive),
  ),
);

// The session watcher is a provider-runtime daemon like the reaper. Its sync path reads
// ProviderSessionDirectory, so it is given the composed directory layer here rather than leaving
// that requirement to leak into every consumer of the app layer.
const LocalProviderSessionsWatcherMounted = LocalProviderSessionsWatcherLive.pipe(
  Layer.provide(ProviderSessionDirectoryLayerLive),
);

const ProviderRuntimeLayerLive = Layer.mergeAll(
  ProviderSessionReaperLive,
  LocalProviderSessionsWatcherMounted,
).pipe(Layer.provideMerge(ProviderLayerLive), Layer.provideMerge(OrchestrationLayerLive));

// The workflow-engine singletons share one provideMerge slot (the `pipe` arity is capped):
// the in-memory run registry (reactor's hot index) + the durable run record + the SQLite
// journal store. Repo + store get the memoized SqlClient from PersistenceLayerLive (Epic 25
// §Open question 2); the registry needs nothing. The scheduler (Epic 27) is layered ON TOP via
// `provideMerge` so it shares that same registry + repo (its arm/fire path resolves runs from
// the one registry and reads the sleeping set from the one repo).
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

const RuntimeCoreDependenciesLive = ReactorLayerLive.pipe(
  // Core Services
  Layer.provideMerge(ServerSettingsLayerLive),
  Layer.provideMerge(CheckpointingLayerLive),
  Layer.provideMerge(SourceControlProviderRegistryLayerLive),
  Layer.provideMerge(GitLayerLive),
  Layer.provideMerge(VcsLayerLive),
  Layer.provideMerge(ProviderRuntimeLayerLive),
  Layer.provideMerge(Layer.mergeAll(TerminalLayerLive, PreviewLayerLive, ToolAuthLayerLive)),
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provideMerge(Keybindings.layer),
  Layer.provideMerge(ProviderRegistryLive),
  Layer.provideMerge(
    T3TeamToolBrokerLive.pipe(
      Layer.provideMerge(T3TeamThreadToolContextStoreLive),
      Layer.provideMerge(T3TeamWidgetRegistryLive),
      Layer.provideMerge(T3TeamContextRefreshServiceLive),
      Layer.provide(OrchestrationLayerLive),
      // t3team.orchestration.run (ephemeral workflows) drives the same durable-engine singletons;
      // memoized by reference, so this shares the registry/repo/store/scheduler instances.
      Layer.provide(WorkflowEngineDurabilityLive),
      // ProviderRegistryLive appears EARLIER in the outer pipe below, but `provideMerge`
      // only feeds a layer's output into layers accumulated BEFORE it in the chain — the
      // broker (which resolves ProviderRegistry via `Effect.serviceOption`) never saw it, so
      // `t3team.thread.start_child` with an explicit provider always failed with "Unknown
      // provider instance … Available: none". Providing it directly here shares the outer
      // instance via layer memoization; its own requirements (config, instance registry,
      // platform) are satisfied by the later outer provideMerges. NOTE: GitWorkflowService/
      // SourceControlProviderRegistry/ProjectSetupScriptRunner have the same visibility gap,
      // but providing VcsLayerLive here would leak its ProjectionSnapshotQuery/
      // TerminalManager requirements out of this composed layer — fix separately.
      Layer.provide(ProviderRegistryLive),
    ),
  ),
  // Shared singletons: the launch route registers parked runs in the registry and writes the
  // run record + journal through the repo/store; the workflow-engine reactor + boot rehydration
  // resolve the same instances. See WorkflowEngineDurabilityLive above.
  Layer.provideMerge(WorkflowEngineDurabilityLive),
  // The instance registry is the new routing keystone — text generation,
  // adapter lookup, and runtime ingestion all resolve `ProviderInstanceId`
  // through this layer. Built-in drivers come from `BUILT_IN_DRIVERS`;
  // `providerInstances` hydration merges `settings.providers.<kind>`
  // with explicit `providerInstances` entries on boot.
  Layer.provideMerge(ProviderInstanceRegistryHydrationLive),
  // Shared native/canonical NDJSON writers used by both the per-instance
  // drivers (native stream, written from inside each `<X>Adapter`) and
  // `ProviderService` (canonical stream, written after event normalization).
  // Provided once at the runtime level so every consumer sees the same
  // logger instances.
  Layer.provideMerge(ProviderEventLoggers.layer),
  // `OpenCodeDriver.create()` yields `OpenCodeRuntime`; previously the old
  // `ProviderRegistryLive` pulled `OpenCodeRuntimeLive` in for itself, but
  // the rewritten registry reads snapshots off the instance registry and
  // no longer transitively provides it. Exposing it at the runtime level
  // keeps a single Live for all opencode consumers.
  Layer.provideMerge(OpenCodeRuntime.OpenCodeRuntimeLive),
  Layer.provideMerge(WorkspaceLayerLive),
  // Favicon + repo identity share one provideMerge slot, and ServerSecretStore rides the
  // cloud slot below: `pipe` accepts at most 20 arguments, and the fork's two extra layers
  // (tool broker, workflow-engine durability) already spend two of them. Going over the cap
  // makes the whole layer resolve to `never`, which surfaces far away as `any` requirement
  // channels in bin.ts / t3team-server.ts rather than here.
  Layer.provideMerge(
    Layer.mergeAll(ProjectFaviconResolverLayerLive, RepositoryIdentityResolver.layer),
  ),
  Layer.provideMerge(ServerEnvironment.layer),
  Layer.provideMerge(AuthLayerLive),
  Layer.provideMerge(
    Layer.mergeAll(
      ServerSecretStore.layer,
      CloudCliTokenManager.layer.pipe(
        Layer.provide(ServerSecretStore.layer),
        Layer.provide(ExternalLauncher.layer),
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

const PullRequestServiceLive = PullRequestService.layer.pipe(
  // One registry entry per supported host; the service only knows the registry.
  Layer.provide(PullRequestProviderRegistry.layer),
  Layer.provide(SourceControlProviderRegistryLayerLive),
  Layer.provide(VcsProcess.layer),
);

export const makeRoutesLayer = Layer.mergeAll(
  Layer.mergeAll(
    HttpApiBuilder.layer(EnvironmentHttpApi).pipe(
      Layer.provide(authHttpApiLayer),
      Layer.provide(connectHttpApiLayer),
      Layer.provide(orchestrationHttpApiLayer),
      Layer.provide(pullRequestHttpApiLayer),
      Layer.provide(serverEnvironmentHttpApiLayer),
      Layer.provide(environmentAuthenticatedAuthLayer),
    ),
    otlpTracesProxyRouteLayer,
    assetRouteLayer,
    staticAndDevRouteLayer,
    websocketRpcRouteLayer,
  ),
  // t3team routes. This is now the ONLY route registry: the parallel `makeT3TeamRoutesLayer`
  // in `t3team-server.ts` was deleted in the 2026-08 upstream sync, since the two copies drifted
  // every time upstream moved. The `t3team` binary launches this same layer (cli/t3team-server.ts).
  Layer.mergeAll(
    t3teamAtlassianAccountsRouteLayer,
    t3teamAtlassianAssetRouteLayer,
    t3teamAtlassianAssetContentRouteLayer,
    t3teamAtlassianBacklogRouteLayer,
    t3teamAtlassianConnectBasicRouteLayer,
    t3teamAtlassianConnectOAuthRouteLayer,
    t3teamAtlassianIssueContentRouteLayer,
    t3teamAtlassianMyWorkRouteLayer,
    t3teamAtlassianOAuthExchangeRouteLayer,
    t3teamAtlassianOAuthFlowRouteLayer,
    t3teamAtlassianProjectIssuesRouteLayer,
    t3teamAtlassianProjectsRouteLayer,
    t3teamAtlassianResourceRouteLayer,
    t3teamAtlassianResourcesRouteLayer,
    t3teamTempoRouteLayer,
  ),
  Layer.mergeAll(
    t3teamGitHubAssetRouteLayer,
    t3teamGitHubInboxRouteLayer,
    t3teamGitHubPullRequestContextRouteLayer,
    localProviderSessionsRouteLayer,
    t3teamProjectWorkspaceBootstrapRouteLayer,
    t3teamProjectWorkspaceDiscoverRecipesRouteLayer,
    t3teamProjectWorkspaceWriteContextFilesRouteLayer,
    t3teamProjectWorkspaceRefreshProjectContextRouteLayer,
    t3teamProjectWorkspaceRefreshWorkItemContextRouteLayer,
    t3teamProjectWorkspaceRefreshWorkItemSliceContextRouteLayer,
    t3teamThreadPlacementRouteLayer,
    t3teamThreadRecipeWorkflowLaunchRouteLayer,
    t3teamThreadWorkflowControlRouteLayer,
    t3teamThreadDraftMutationStatusRouteLayer,
    t3teamThreadWorkflowResolveInputRouteLayer,
    t3teamThreadToolContextRouteLayer,
    t3teamWidgetToolCallRouteLayer,
  ),
  McpHttpServer.layer.pipe(Layer.provide(McpSessionRegistry.layer)),
).pipe(
  // Both transports consume the same service instance, so caches single-flight across clients
  // and mutations observed on WebSocket invalidate patches subsequently read over HTTP.
  Layer.provide(PullRequestServiceLive),
  Layer.provide(PreviewAutomationBroker.layer),
  Layer.provide(ServerSelfUpdate.layer),
  Layer.provide(commandReadinessLayer),
  Layer.provide(browserApiCorsLayer),
  Layer.provide(httpCompressionLayer),
);

export const makeServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const activation = yield* Deferred.make<void>();
    const awaitActivation = Deferred.await(activation);
    const activationLayer = Layer.succeed(ServerActivation, awaitActivation);
    const runtimeStateParked = yield* Deferred.make<void>();
    const tailscaleParked = yield* Deferred.make<void>();
    const cloudLinkParked = yield* Deferred.make<void>();
    const routesReady = yield* Deferred.make<void>();
    const launcherLayer = ServiceLauncherClient.layer;

    yield* fixPath();

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

          const state = yield* makePersistedServerRuntimeState({
            config,
            port: address.port,
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
        if (!hasCloudPublicConfig) {
          yield* Deferred.succeed(cloudLinkParked, undefined).pipe(Effect.orDie);
          return;
        }
        const releaseManagedTunnel = releaseManagedTunnelOnShutdown().pipe(
          Effect.timeout("10 seconds"),
          Effect.tap((released) =>
            released ? Effect.logInfo("Released the managed tunnel on shutdown") : Effect.void,
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning(
              "Failed to release the managed tunnel on shutdown; the next link reuses it",
              { cause },
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
        yield* forkParked(
          Effect.gen(function* () {
            if (!cleanupBeforeActivation) {
              yield* Effect.addFinalizer(() => releaseManagedTunnel);
            }
            if (!(yield* CloudCliState.readCliDesiredCloudLink)) return;
            const server = yield* HttpServer.HttpServer;
            const address = server.address;
            if (typeof address === "string" || !("port" in address)) return;
            // No settling delay before the first attempt: routes are already
            // serving by the time activation opens this gate (the startup
            // sequence awaits routesReady), and the retry schedule below
            // covers anything this sleep used to hedge against. Every
            // millisecond here is dead time on the path to remote
            // reachability after a restart.
            yield* reconcileDesiredCloudLink(`http://127.0.0.1:${address.port}`).pipe(
              Effect.retry({
                while: (error) =>
                  error._tag !== "EnvironmentHttpBadRequestError" &&
                  error._tag !== "EnvironmentHttpUnauthorizedError" &&
                  error._tag !== "EnvironmentHttpConflictError",
                schedule: Schedule.exponential("1 second").pipe(
                  Schedule.modifyDelay(({ duration }) =>
                    Effect.succeed(Duration.min(duration, Duration.seconds(30))),
                  ),
                  Schedule.upTo({ duration: "10 minutes" }),
                ),
              }),
              Effect.tap(() => Effect.logInfo("T3 Connect desired link reconciled on startup")),
              Effect.catch((cause) =>
                Effect.logWarning("Failed to reconcile T3 Connect desired link on startup", {
                  cause,
                }),
              ),
            );
          }),
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
    }).pipe(Layer.tap(() => Deferred.succeed(routesReady, undefined).pipe(Effect.orDie)));
    const serverApplicationLayer = Layer.mergeAll(
      routesLayer,
      httpListeningLayer,
      runtimeStateLayer,
      tailscaleServeLayer,
      T3TeamWorkflowEngineReactorLive,
      T3TeamActorMessageReactorLive,
      T3TeamThreadStopCascadeReactorLive,
      T3TeamChildStatusReactorLive,
      T3TeamWorkflowEngineRehydrateLive,
      cloudDesiredLinkReconcileLayer,
    );

    return serverApplicationLayer.pipe(
      Layer.provideMerge(runtimeServicesLive),
      Layer.provide(activationLayer),
      Layer.provideMerge(serverRelayBrokerTracingLayer),
      Layer.provideMerge(HttpServerLive),
      Layer.provide(ApplicationObservabilityLive),
      Layer.provideMerge(FetchHttpClient.layer),
      Layer.provideMerge(VcsProcess.layer),
      Layer.provideMerge(PlatformServicesLive),
    );
  }),
);

// The CLI supplies configuration.
export const runServer = Layer.launch(makeServerLayer);
