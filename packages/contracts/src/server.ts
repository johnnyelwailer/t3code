import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AcpRegistryUrlAuthAction } from "./acpRegistry.ts";
import {
  type EnvironmentMachineKind,
  ExecutionEnvironmentDescriptor,
  ServerSelfUpdateMethod,
} from "./environment.ts";
import { AuthClientPresentationMetadata, ServerAuthDescriptor } from "./auth.ts";
import {
  ForwardCompatibleArray,
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import {
  KeybindingCommand,
  KeybindingValue,
  KeybindingWhen,
  ResolvedKeybindingsConfig,
} from "./keybindings.ts";
import { EditorId, FileManagerRevealKind, RemoteOpenTarget } from "./editor.ts";
import { ModelCapabilities, ProviderOptionDescriptor } from "./model.ts";
import { RuntimeMode } from "./providerPolicy.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import { ServerProviderUsageLimits, UsageLimitSourceSnapshots } from "./providerUsageLimits.ts";
import { ServerSettings } from "./settings.ts";
import { FeatureFlagValues } from "./t3team-featureFlags.ts";
import { DesktopUpdateChannelSchema } from "./ipc.ts";

const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = ForwardCompatibleArray(ServerConfigIssue);

export const ServerProviderState = Schema.Literals(["ready", "warning", "error", "disabled"]);
export type ServerProviderState = typeof ServerProviderState.Type;

export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

export const ServerProviderAuth = Schema.Struct({
  status: ServerProviderAuthStatus,
  type: Schema.optional(TrimmedNonEmptyString),
  label: Schema.optional(TrimmedNonEmptyString),
  email: Schema.optional(TrimmedNonEmptyString),
  action: Schema.optional(AcpRegistryUrlAuthAction),
  canLogout: Schema.optional(Schema.Boolean),
  subscriptionSharing: Schema.optional(Schema.Boolean),
  profileId: Schema.optional(TrimmedNonEmptyString),
  workspaceId: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderAuth = typeof ServerProviderAuth.Type;

export const ServerProviderModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  shortName: Schema.optional(TrimmedNonEmptyString),
  subProvider: Schema.optional(TrimmedNonEmptyString),
  aliases: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  badge: Schema.optional(Schema.Literal("new")),
  isCustom: Schema.Boolean,
  isDefault: Schema.optional(Schema.Boolean),
  isLegacy: Schema.optional(Schema.Boolean),
  capabilities: Schema.NullOr(ModelCapabilities),
});
export type ServerProviderModel = typeof ServerProviderModel.Type;

export const ServerProviderUpdateRequiredModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  badge: Schema.optional(Schema.Literal("new")),
  minVersion: TrimmedNonEmptyString,
});
export type ServerProviderUpdateRequiredModel = typeof ServerProviderUpdateRequiredModel.Type;

export const ServerProviderSlashCommandInput = Schema.Struct({
  hint: TrimmedNonEmptyString,
});
export type ServerProviderSlashCommandInput = typeof ServerProviderSlashCommandInput.Type;

export const ServerProviderSlashCommand = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  input: Schema.optional(ServerProviderSlashCommandInput),
});
export type ServerProviderSlashCommand = typeof ServerProviderSlashCommand.Type;

export const ServerProviderSkill = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  path: TrimmedNonEmptyString,
  scope: Schema.optional(TrimmedNonEmptyString),
  enabled: Schema.Boolean,
  displayName: Schema.optional(TrimmedNonEmptyString),
  shortDescription: Schema.optional(TrimmedNonEmptyString),
  /** Claude disable-model-invocation: only users can invoke; composers must offer a slash command. */
  userInvocationOnly: Schema.optional(Schema.Boolean),
  /** Claude user-invocable:false: only agents can invoke; composers must hide the slash command. */
  userInvocable: Schema.optional(Schema.Boolean),
});
export type ServerProviderSkill = typeof ServerProviderSkill.Type;

export const ServerProviderWorkspaceSnapshot = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  checkedAt: IsoDateTime,
  slashCommands: Schema.Array(ServerProviderSlashCommand),
  slashCommandsPending: Schema.optional(Schema.Boolean),
  skills: Schema.Array(ServerProviderSkill),
  optionDescriptors: Schema.optional(Schema.Array(ProviderOptionDescriptor)),
});
export type ServerProviderWorkspaceSnapshot = typeof ServerProviderWorkspaceSnapshot.Type;

export const PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS = 5 * 60_000;

export function isProviderWorkspaceSnapshotCurrent(
  snapshot: Pick<ServerProviderWorkspaceSnapshot, "checkedAt">,
  nowMs: number,
): boolean {
  return nowMs - Date.parse(snapshot.checkedAt) < PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS;
}

/** Unavailable snapshots must set installed and enabled false. */
export const ServerProviderAvailability = Schema.Literals(["available", "unavailable"]);
export type ServerProviderAvailability = typeof ServerProviderAvailability.Type;

export const ServerProviderContinuation = Schema.Struct({
  groupKey: TrimmedNonEmptyString,
});
export type ServerProviderContinuation = typeof ServerProviderContinuation.Type;

export const ServerProviderCompatibilityStatus = Schema.Literals([
  "unknown",
  "supported",
  "graceful",
  "unsupported",
  "broken",
]);
export const ServerProviderCompatibilityAdvisory = Schema.Struct({
  status: ServerProviderCompatibilityStatus,
  latestVersionStatus: Schema.optionalKey(ServerProviderCompatibilityStatus),
  message: Schema.NullOr(TrimmedNonEmptyString),
  recommendedVersion: Schema.NullOr(TrimmedNonEmptyString),
  recommendedRange: Schema.NullOr(TrimmedNonEmptyString),
});
export type ServerProviderCompatibilityAdvisory = typeof ServerProviderCompatibilityAdvisory.Type;

export const ServerProviderVersionAdvisoryStatus = Schema.Literals([
  "unknown",
  "current",
  "behind_latest",
]);
export type ServerProviderVersionAdvisoryStatus = typeof ServerProviderVersionAdvisoryStatus.Type;

export const ServerProviderVersionAdvisory = Schema.Struct({
  status: ServerProviderVersionAdvisoryStatus,
  currentVersion: Schema.NullOr(TrimmedNonEmptyString),
  latestVersion: Schema.NullOr(TrimmedNonEmptyString),
  updateCommand: Schema.NullOr(TrimmedNonEmptyString),
  canUpdate: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  canInstallVersion: Schema.optionalKey(Schema.Boolean),
  checkedAt: Schema.NullOr(IsoDateTime),
  message: Schema.NullOr(TrimmedNonEmptyString),
});
export type ServerProviderVersionAdvisory = typeof ServerProviderVersionAdvisory.Type;

export const ServerProviderUpdateStatus = Schema.Literals([
  "idle",
  "queued",
  "running",
  "succeeded",
  "failed",
  "unchanged",
]);
export type ServerProviderUpdateStatus = typeof ServerProviderUpdateStatus.Type;

export const ServerProviderUpdateState = Schema.Struct({
  status: ServerProviderUpdateStatus,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
  message: Schema.NullOr(TrimmedNonEmptyString),
  output: Schema.NullOr(Schema.String.check(Schema.isMaxLength(10_000))),
});
export type ServerProviderUpdateState = typeof ServerProviderUpdateState.Type;

export const ServerProvider = Schema.Struct({
  // Only instanceId is stable enough for provider routing.
  instanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  displayName: Schema.optional(TrimmedNonEmptyString),
  accentColor: Schema.optional(TrimmedNonEmptyString),
  // Validate driver-supplied remote icons against the driver's trusted origin.
  iconUrl: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(2_048))),
  // t3team: pack-supplied inline icon (a data URL, so it can exceed iconUrl's
  // 2048-char cap and needs no origin check). Clients prefer it over iconUrl.
  iconDataUrl: Schema.optional(TrimmedNonEmptyString),
  configurationSource: Schema.optional(Schema.Literal("pack")),
  badgeLabel: Schema.optional(TrimmedNonEmptyString),
  continuation: Schema.optional(ServerProviderContinuation),
  showInteractionModeToggle: Schema.optional(Schema.Boolean),
  reportsContextWindow: Schema.optional(Schema.Boolean),
  supportedRuntimeModes: Schema.optional(ForwardCompatibleArray(RuntimeMode)),
  supportsConversationRollback: Schema.optional(Schema.Boolean),
  supportsTextGeneration: Schema.optional(Schema.Boolean),
  setup: Schema.optional(
    Schema.Struct({
      canAuthenticate: Schema.Boolean,
      canInstall: Schema.Boolean,
      documentationUrl: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(2_048))),
    }),
  ),
  nativeSessions: Schema.optional(
    Schema.Struct({
      canList: Schema.Boolean,
      canLoad: Schema.Boolean,
      canResume: Schema.Boolean,
      canDelete: Schema.optional(Schema.Boolean),
    }),
  ),
  configurableProviders: Schema.optional(Schema.Boolean),
  runtimePaths: Schema.optionalKey(
    Schema.Struct({
      homePath: TrimmedNonEmptyString,
      shadowHomePath: Schema.NullOr(TrimmedNonEmptyString),
    }),
  ),
  enabled: Schema.Boolean,
  installed: Schema.Boolean,
  version: Schema.NullOr(TrimmedNonEmptyString),
  // Version reported by the installed CLI for a local provider with a separate
  // server. Null means unknown; absence keeps legacy snapshots on `version`.
  installedVersion: Schema.optionalKey(Schema.NullOr(TrimmedNonEmptyString)),
  status: ServerProviderState,
  auth: ServerProviderAuth,
  checkedAt: IsoDateTime,
  message: Schema.optional(TrimmedNonEmptyString),
  availability: Schema.optional(ServerProviderAvailability),
  unavailableReason: Schema.optional(TrimmedNonEmptyString),
  models: Schema.Array(ServerProviderModel),
  // Kept apart from `models` so clients that predate it never offer them.
  updateRequiredModels: Schema.optionalKey(Schema.Array(ServerProviderUpdateRequiredModel)),
  slashCommands: Schema.Array(ServerProviderSlashCommand).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  skills: Schema.Array(ServerProviderSkill).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  workspaceSnapshots: Schema.optionalKey(Schema.Array(ServerProviderWorkspaceSnapshot)),
  usageLimits: Schema.optional(ServerProviderUsageLimits),
  versionAdvisory: Schema.optionalKey(ServerProviderVersionAdvisory),
  compatibilityAdvisory: Schema.optionalKey(ServerProviderCompatibilityAdvisory),
  updateState: Schema.optionalKey(ServerProviderUpdateState),
});
export type ServerProvider = typeof ServerProvider.Type;

export const ServerProviders = ForwardCompatibleArray(ServerProvider);
export type ServerProviders = typeof ServerProviders.Type;

export const isProviderAvailable = (snapshot: ServerProvider): boolean =>
  snapshot.availability !== "unavailable";

/** Legacy producers omit this field and support text generation. */
export const isProviderTextGenerationCapable = (snapshot: ServerProvider): boolean =>
  snapshot.supportsTextGeneration !== false;

export const OtlpEndpointSource = Schema.Literals(["environment", "bootstrap", "settings"]);
export type OtlpEndpointSource = typeof OtlpEndpointSource.Type;

export const ServerObservability = Schema.Struct({
  logsDirectoryPath: TrimmedNonEmptyString,
  localTracingEnabled: Schema.Boolean,
  otlpTracesUrl: Schema.optional(TrimmedNonEmptyString),
  otlpTracesSource: Schema.optional(OtlpEndpointSource),
  otlpTracesVariable: Schema.optional(TrimmedNonEmptyString),
  otlpTracesEnabled: Schema.Boolean,
  otlpMetricsUrl: Schema.optional(TrimmedNonEmptyString),
  otlpMetricsSource: Schema.optional(OtlpEndpointSource),
  otlpMetricsVariable: Schema.optional(TrimmedNonEmptyString),
  otlpMetricsEnabled: Schema.Boolean,
  otlpLogsUrl: Schema.optional(TrimmedNonEmptyString),
  otlpLogsSource: Schema.optional(OtlpEndpointSource),
  otlpLogsVariable: Schema.optional(TrimmedNonEmptyString),
  otlpLogsEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type ServerObservability = typeof ServerObservability.Type;

export const OtlpSignal = Schema.Literals(["traces", "metrics", "logs"]);
export type OtlpSignal = typeof OtlpSignal.Type;

export const OtlpEndpointCheckInput = Schema.Struct({
  signal: OtlpSignal,
  url: TrimmedNonEmptyString.check(Schema.isPattern(/^https?:\/\/./i)),
});
export type OtlpEndpointCheckInput = typeof OtlpEndpointCheckInput.Type;

export const OtlpEndpointCheckResult = Schema.Union([
  Schema.TaggedStruct("Accepted", { latencyMs: Schema.Number }),
  Schema.TaggedStruct("Rejected", { status: Schema.Number }),
  Schema.TaggedStruct("Unreachable", { timedOut: Schema.Boolean }),
]);
export type OtlpEndpointCheckResult = typeof OtlpEndpointCheckResult.Type;

/** The client tells the server what it is, so the triage context can name it. */
export const ServerPrepareTriageInput = Schema.Struct({
  client: AuthClientPresentationMetadata,
});
export type ServerPrepareTriageInput = typeof ServerPrepareTriageInput.Type;

export const ServerPrepareTriageResult = Schema.Struct({
  /** Composer text that links the session's prompt file. */
  prompt: Schema.String,
});
export type ServerPrepareTriageResult = typeof ServerPrepareTriageResult.Type;

/**
 * The prompt file links as a chip in the user's message; clients spot a triage
 * draft by it.
 */
export const TRIAGE_PROMPT_FILE_NAME = "triage-playbook.md";

export class ServerPrepareTriageError extends Schema.TaggedError<ServerPrepareTriageError>()(
  "ServerPrepareTriageError",
  { cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "Could not write the triage session files.";
  }
}

export const ServerTraceDiagnosticsErrorKind = Schema.Literals([
  "trace-file-not-found",
  "trace-file-read-failed",
]);
export type ServerTraceDiagnosticsErrorKind = typeof ServerTraceDiagnosticsErrorKind.Type;

export const ServerTraceDiagnosticsSpanSummary = Schema.Struct({
  name: TrimmedNonEmptyString,
  count: NonNegativeInt,
  failureCount: NonNegativeInt,
  totalDurationMs: Schema.Number,
  averageDurationMs: Schema.Number,
  maxDurationMs: Schema.Number,
});
export type ServerTraceDiagnosticsSpanSummary = typeof ServerTraceDiagnosticsSpanSummary.Type;

export const ServerTraceDiagnosticsFailureSummary = Schema.Struct({
  name: TrimmedNonEmptyString,
  cause: TrimmedNonEmptyString,
  count: NonNegativeInt,
  lastSeenAt: Schema.DateTimeUtc,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsFailureSummary = typeof ServerTraceDiagnosticsFailureSummary.Type;

export const ServerTraceDiagnosticsRecentFailure = Schema.Struct({
  name: TrimmedNonEmptyString,
  cause: TrimmedNonEmptyString,
  durationMs: Schema.Number,
  endedAt: Schema.DateTimeUtc,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsRecentFailure = typeof ServerTraceDiagnosticsRecentFailure.Type;

export const ServerTraceDiagnosticsSpanOccurrence = Schema.Struct({
  name: TrimmedNonEmptyString,
  durationMs: Schema.Number,
  endedAt: Schema.DateTimeUtc,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsSpanOccurrence = typeof ServerTraceDiagnosticsSpanOccurrence.Type;

export const ServerTraceDiagnosticsLogEvent = Schema.Struct({
  spanName: TrimmedNonEmptyString,
  level: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
  seenAt: Schema.DateTimeUtc,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsLogEvent = typeof ServerTraceDiagnosticsLogEvent.Type;

export const ServerTraceDiagnosticsResult = Schema.Struct({
  traceFilePath: TrimmedNonEmptyString,
  scannedFilePaths: Schema.Array(TrimmedNonEmptyString),
  readAt: Schema.DateTimeUtc,
  recordCount: NonNegativeInt,
  parseErrorCount: NonNegativeInt,
  firstSpanAt: Schema.Option(Schema.DateTimeUtc),
  lastSpanAt: Schema.Option(Schema.DateTimeUtc),
  failureCount: NonNegativeInt,
  interruptionCount: NonNegativeInt,
  slowSpanThresholdMs: NonNegativeInt,
  slowSpanCount: NonNegativeInt,
  logLevelCounts: Schema.Record(TrimmedNonEmptyString, NonNegativeInt),
  topSpansByCount: Schema.Array(ServerTraceDiagnosticsSpanSummary),
  slowestSpans: Schema.Array(ServerTraceDiagnosticsSpanOccurrence),
  commonFailures: Schema.Array(ServerTraceDiagnosticsFailureSummary),
  latestFailures: Schema.Array(ServerTraceDiagnosticsRecentFailure),
  latestWarningAndErrorLogs: Schema.Array(ServerTraceDiagnosticsLogEvent),
  partialFailure: Schema.Option(Schema.Boolean),
  error: Schema.Option(
    Schema.Struct({
      kind: ServerTraceDiagnosticsErrorKind,
      message: TrimmedNonEmptyString,
    }),
  ),
});
export type ServerTraceDiagnosticsResult = typeof ServerTraceDiagnosticsResult.Type;

export const ServerProcessSignal = Schema.Literals(["SIGINT", "SIGKILL"]);
export type ServerProcessSignal = typeof ServerProcessSignal.Type;

export const ServerProcessDiagnosticsEntry = Schema.Struct({
  pid: PositiveInt,
  startTimeMs: NonNegativeInt,
  ppid: NonNegativeInt,
  pgid: Schema.Option(Schema.Int),
  status: TrimmedNonEmptyString,
  cpuPercent: Schema.Number,
  rssBytes: NonNegativeInt,
  elapsed: TrimmedNonEmptyString,
  command: TrimmedNonEmptyString,
  depth: NonNegativeInt,
  childPids: Schema.Array(PositiveInt),
});
export type ServerProcessDiagnosticsEntry = typeof ServerProcessDiagnosticsEntry.Type;

export const ServerProcessDiagnosticsResult = Schema.Struct({
  serverPid: PositiveInt,
  readAt: Schema.DateTimeUtc,
  processCount: NonNegativeInt,
  totalRssBytes: NonNegativeInt,
  totalCpuPercent: Schema.Number,
  processes: Schema.Array(ServerProcessDiagnosticsEntry),
  error: Schema.Option(
    Schema.Struct({
      message: TrimmedNonEmptyString,
    }),
  ),
});
export type ServerProcessDiagnosticsResult = typeof ServerProcessDiagnosticsResult.Type;

export const ServerProcessResourceHistoryInput = Schema.Struct({
  windowMs: NonNegativeInt,
  bucketMs: NonNegativeInt,
});
export type ServerProcessResourceHistoryInput = typeof ServerProcessResourceHistoryInput.Type;

export const ServerProcessResourceHistoryBucket = Schema.Struct({
  startedAt: Schema.DateTimeUtc,
  endedAt: Schema.DateTimeUtc,
  avgCpuPercent: Schema.Number,
  maxCpuPercent: Schema.Number,
  maxRssBytes: NonNegativeInt,
  maxProcessCount: NonNegativeInt,
});
export type ServerProcessResourceHistoryBucket = typeof ServerProcessResourceHistoryBucket.Type;

export const ServerProcessResourceHistorySummary = Schema.Struct({
  processKey: TrimmedNonEmptyString,
  pid: PositiveInt,
  ppid: NonNegativeInt,
  command: TrimmedNonEmptyString,
  depth: NonNegativeInt,
  isServerRoot: Schema.Boolean,
  firstSeenAt: Schema.DateTimeUtc,
  lastSeenAt: Schema.DateTimeUtc,
  currentCpuPercent: Schema.Number,
  avgCpuPercent: Schema.Number,
  maxCpuPercent: Schema.Number,
  cpuSecondsApprox: Schema.Number,
  currentRssBytes: NonNegativeInt,
  maxRssBytes: NonNegativeInt,
  sampleCount: NonNegativeInt,
});
export type ServerProcessResourceHistorySummary = typeof ServerProcessResourceHistorySummary.Type;

export const ServerProcessResourceHistoryFailureTag = Schema.Literals([
  "ProcessDiagnosticsQueryTimeoutError",
  "ProcessDiagnosticsQueryFailedError",
  "ProcessDiagnosticsServerProcessSignalError",
  "ProcessDiagnosticsNotDescendantError",
  "ProcessDiagnosticsSignalFailedError",
]);
export type ServerProcessResourceHistoryFailureTag =
  typeof ServerProcessResourceHistoryFailureTag.Type;

export const ServerProcessResourceHistoryResult = Schema.Struct({
  readAt: Schema.DateTimeUtc,
  windowMs: NonNegativeInt,
  bucketMs: NonNegativeInt,
  sampleIntervalMs: NonNegativeInt,
  retainedSampleCount: NonNegativeInt,
  totalCpuSecondsApprox: Schema.Number,
  buckets: Schema.Array(ServerProcessResourceHistoryBucket),
  topProcesses: Schema.Array(ServerProcessResourceHistorySummary),
  error: Schema.Option(
    Schema.Struct({
      failureTag: ServerProcessResourceHistoryFailureTag,
      message: TrimmedNonEmptyString,
    }),
  ),
});
export type ServerProcessResourceHistoryResult = typeof ServerProcessResourceHistoryResult.Type;

export const ServerSignalProcessInput = Schema.Struct({
  pid: PositiveInt,
  startTimeMs: NonNegativeInt,
  signal: ServerProcessSignal,
});
export type ServerSignalProcessInput = typeof ServerSignalProcessInput.Type;

export const ServerSignalProcessResult = Schema.Struct({
  pid: PositiveInt,
  signal: ServerProcessSignal,
  signaled: Schema.Boolean,
  message: Schema.Option(TrimmedNonEmptyString),
});
export type ServerSignalProcessResult = typeof ServerSignalProcessResult.Type;

export const EnvironmentThemeColor = Schema.String.check(
  Schema.isPattern(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
);
export type EnvironmentThemeColor = typeof EnvironmentThemeColor.Type;

/** Reserve appearance keywords so published themes cannot replace stock preferences. */
export const EnvironmentThemeId = Schema.String.check(
  Schema.isPattern(/^(?!(?:system|light|dark)$)[a-z0-9](?:[a-z0-9-]{0,47})$/),
);
export type EnvironmentThemeId = typeof EnvironmentThemeId.Type;

const EnvironmentThemeColors = Schema.Record(
  Schema.String.check(Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/)),
  TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
);

const environmentThemeFields = {
  version: Schema.optional(Schema.Literal(1)),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(48)),
  appearance: Schema.Literals(["light", "dark"]),
  /** Derive the palette from canvas/accent, then overlay colors; without them, colors is the palette. */
  canvas: Schema.optional(EnvironmentThemeColor),
  accent: Schema.optional(EnvironmentThemeColor),
  colors: Schema.optional(EnvironmentThemeColors),
  variants: Schema.optional(
    Schema.Struct({
      light: Schema.optional(EnvironmentThemeColors),
      dark: Schema.optional(EnvironmentThemeColors),
    }),
  ),
};

export const EnvironmentThemeFile = Schema.Struct(environmentThemeFields);
export type EnvironmentThemeFile = typeof EnvironmentThemeFile.Type;

export const EnvironmentTheme = Schema.Struct({
  id: EnvironmentThemeId,
  ...environmentThemeFields,
});
export type EnvironmentTheme = typeof EnvironmentTheme.Type;

export function environmentThemeFileHasColors(file: EnvironmentThemeFile): boolean {
  return (
    (file.canvas !== undefined && file.accent !== undefined) ||
    (file.colors !== undefined && Object.keys(file.colors).length > 0)
  );
}

/** tailnet means this machine's Tailscale interface; other private addresses are lan. */
export const ServerDirectEndpointKind = Schema.Literals(["lan", "tailnet"]);
export type ServerDirectEndpointKind = typeof ServerDirectEndpointKind.Type;

export const ServerDirectEndpoint = Schema.Struct({
  kind: ServerDirectEndpointKind,
  httpBaseUrl: TrimmedNonEmptyString,
});
export type ServerDirectEndpoint = typeof ServerDirectEndpoint.Type;

/**
 * A stretch where the server's event loop could not run, so it answered
 * nothing and clients may have dropped the connection.
 */
export const ServerEventLoopStall = Schema.Struct({
  detectedAt: IsoDateTime,
  durationMs: NonNegativeInt,
  /** One-minute load average when the stall was seen. Absent on Windows, which has none. */
  loadAverage: Schema.optionalKey(Schema.Number),
  cpuCount: PositiveInt,
});
export type ServerEventLoopStall = typeof ServerEventLoopStall.Type;

export const ServerConfig = Schema.Struct({
  environment: ExecutionEnvironmentDescriptor,
  auth: ServerAuthDescriptor,
  cwd: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviders,
  availableEditors: ForwardCompatibleArray(EditorId),
  remoteOpenTargets: Schema.optionalKey(ForwardCompatibleArray(RemoteOpenTarget)),
  /** Hints only; verify each address answers as this environment. */
  directEndpoints: Schema.optionalKey(ForwardCompatibleArray(ServerDirectEndpoint)),
  observability: ServerObservability,
  settings: ServerSettings,
  shellResumeCompletionMarker: Schema.optionalKey(Schema.Boolean),
  /**
   * The shell can leave idle subagent children out of snapshots (`omitIdleSubagents`), and
   * `getThreadFamily` and `getWorktreeThreadIds` serve the rows it leaves out.
   */
  shellThreadFamilies: Schema.optionalKey(Schema.Boolean),
  /**
   * The shell can leave older settled threads out of snapshots (`omitOlderSettled`), and
   * `getOlderSettledThreads` serves them. Only servers that also advertise `shellThreadFamilies`.
   */
  shellOlderSettled: Schema.optionalKey(Schema.Boolean),
  shellRevealInFileManager: Schema.optionalKey(Schema.Boolean),
  shellRevealInFileManagerKind: Schema.optionalKey(FileManagerRevealKind),
  threadResumeCompletionMarker: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether the client should stagger thread-subscription resubscribes
   * (first few of a burst immediate, the rest spread over time) instead of
   * reopening every live thread stream in the same tick after a session
   * change. Server-authoritative runtime feature flag (env
   * `NEXI_FF_THREAD_RESUB_STAGGER`, default on); absent on older servers, so
   * clients keep the legacy immediate behavior against them.
   */
  threadResubscribeStagger: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether the resource-pressure model (sampler, `server.getResourcePressure`,
   * auto-pause, per-thread cleanup, diagnostics panel) is active. Runtime feature flag (env
   * `NEXI_FF_RESOURCE_PRESSURE`, default off); absent on older servers.
   */
  resourcePressure: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether the My Work kanban board advertises semantic zoom (continuous density progress with
   * three soft-snap levels, steered from the toolbar or Ctrl/Cmd+wheel / trackpad pinch).
   * Server-advertised runtime feature flag (env `NEXI_FF_KANBAN_SEMANTIC_ZOOM`, default off);
   * absent on older servers.
   */
  kanbanSemanticZoom: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether a project can designate a linked repository as its MAIN repository (picker,
   * switch-with-migration, auto-detection, `start_child` default). Runtime feature flag (env
   * `NEXI_FF_MAIN_REPOSITORY`, default on); absent on older servers.
   */
  mainRepository: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether a cloud session for a project with no machine definition sets one up.
   * Runtime feature flag (env `NEXI_FF_MACHINE_SETUP`, default off); absent on older servers.
   */
  machineSetup: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether the work profile chooser is offered (first-run setup surface, the add-project
   * wizard's profile step, the Settings default-profile picker). Runtime feature flag (env
   * `NEXI_FF_WORK_PROFILE_CHOOSER`, default OFF); absent on older servers, which clients must
   * also treat as off. While off, clients use the developer profile and leave any stored
   * profile choice untouched.
   */
  workProfileChooser: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether My Work hosts its aside through `RightPanelTabs` on a fixed panel ref (PR / thread /
   * browser tabs, Agent kickoff when empty). Runtime feature flag (env `NEXI_FF_MYWORK_RIGHT_PANEL`,
   * default on); absent on older servers, which clients treat as on (legacy DigestPrAside remains
   * available when the flag is explicitly off).
   */
  myWorkRightPanel: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether a run that failed on a transient gateway error auto-resumes on a durable backoff, with
   * the live composer retry banner and its toggle. Runtime feature flag (env
   * `NEXI_FF_TRANSIENT_AUTO_RESUME`, default on); absent on older servers, which clients treat as
   * off (no banner, no toggle).
   */
  transientAutoResume: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether this server names the project state dir `.nexi` instead of `.t3team`. Runtime
   * feature flag (env `NEXI_FF_NEXI_STATE_DIR`, default on); absent on older servers.
   */
  nexiStateDir: Schema.optionalKey(Schema.Boolean),
  /**
   * Effective value of every registered feature flag (host and pack), keyed by flag. Clients gate
   * surfaces on it; live changes arrive as `featureFlagsUpdated`. Absent on older servers.
   */
  featureFlags: Schema.optionalKey(FeatureFlagValues),
  /** Send window fields only when advertised. */
  threadSnapshotPagination: Schema.optionalKey(Schema.Boolean),
  threadFind: Schema.optionalKey(Schema.Boolean),
  threadFindProgressive: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether this server registers its working directory (`cwd`) as a project on startup.
   * Absent on servers that predate the field.
   */
  projectFromCwd: Schema.optionalKey(Schema.Boolean),
  /** Settings patches may carry `secretProviders`; older servers drop the key without an error. */
  secretProviderSettings: Schema.optionalKey(Schema.Boolean),
  /** Secret settings may point at a secret provider; older servers drop the reference. */
  secretReferences: Schema.optionalKey(Schema.Boolean),
  scratchWorkspaceRoot: Schema.optionalKey(TrimmedNonEmptyString),
  newProjectsRoot: Schema.optionalKey(TrimmedNonEmptyString),
  /**
   * The latest stall long enough to notice, sent only for a few minutes after
   * it. A client that reconnects reads it to say why the host stopped
   * answering. Clients do not cache it, since it describes the host at connect.
   */
  lastEventLoopStall: Schema.optionalKey(ServerEventLoopStall),
  /**
   * Never sent in a config snapshot: the theme stream emits the current set
   * before any change, so a snapshot carrying it too would hand every
   * subscriber the same array twice per connect.
   */
  environmentThemes: Schema.optional(Schema.Array(EnvironmentTheme)),
  /** Stream-only and opt-in; the source stream emits the current set on subscribe. */
  usageLimitSources: Schema.optional(UsageLimitSourceSnapshots),
});
export type ServerConfig = typeof ServerConfig.Type;

export function resolveEnvironmentMachineKind(
  config: {
    readonly environment: Pick<ExecutionEnvironmentDescriptor, "platform">;
    readonly settings?: Pick<ServerSettings, "environmentIcon">;
  } | null,
): EnvironmentMachineKind {
  return config?.settings?.environmentIcon ?? config?.environment.platform.machine ?? "server";
}

const ServerUpsertKeybindingReplaceTarget = Schema.Struct({
  key: KeybindingValue,
  command: KeybindingCommand,
  when: Schema.optional(KeybindingWhen),
});

export const ServerUpsertKeybindingInput = Schema.Struct({
  key: KeybindingValue,
  command: KeybindingCommand,
  when: Schema.optional(KeybindingWhen),
  replace: Schema.optional(ServerUpsertKeybindingReplaceTarget),
});
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

export const ServerRemoveKeybindingInput = ServerUpsertKeybindingReplaceTarget;
export type ServerRemoveKeybindingInput = typeof ServerRemoveKeybindingInput.Type;

export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

export const ServerRemoveKeybindingResult = ServerUpsertKeybindingResult;
export type ServerRemoveKeybindingResult = typeof ServerRemoveKeybindingResult.Type;

export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviders,
  settings: Schema.optional(ServerSettings),
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

export const ServerConfigKeybindingsUpdatedPayload = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerConfigKeybindingsUpdatedPayload =
  typeof ServerConfigKeybindingsUpdatedPayload.Type;

export const ServerConfigProviderStatusesPayload = Schema.Struct({
  providers: ServerProviders,
});
export type ServerConfigProviderStatusesPayload = typeof ServerConfigProviderStatusesPayload.Type;

export const ServerConfigSettingsUpdatedPayload = Schema.Struct({
  settings: ServerSettings,
});
export type ServerConfigSettingsUpdatedPayload = typeof ServerConfigSettingsUpdatedPayload.Type;

export const ServerConfigStreamSnapshotEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("snapshot"),
  config: ServerConfig,
});
export type ServerConfigStreamSnapshotEvent = typeof ServerConfigStreamSnapshotEvent.Type;

export const ServerConfigStreamKeybindingsUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("keybindingsUpdated"),
  payload: ServerConfigKeybindingsUpdatedPayload,
});
export type ServerConfigStreamKeybindingsUpdatedEvent =
  typeof ServerConfigStreamKeybindingsUpdatedEvent.Type;

export const ServerConfigStreamProviderStatusesEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("providerStatuses"),
  payload: ServerConfigProviderStatusesPayload,
});
export type ServerConfigStreamProviderStatusesEvent =
  typeof ServerConfigStreamProviderStatusesEvent.Type;

export const ServerConfigStreamSettingsUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("settingsUpdated"),
  payload: ServerConfigSettingsUpdatedPayload,
});
export type ServerConfigStreamSettingsUpdatedEvent =
  typeof ServerConfigStreamSettingsUpdatedEvent.Type;

export const ServerConfigEnvironmentThemesUpdatedPayload = Schema.Struct({
  themes: Schema.Array(EnvironmentTheme),
});
export type ServerConfigEnvironmentThemesUpdatedPayload =
  typeof ServerConfigEnvironmentThemesUpdatedPayload.Type;

export const ServerConfigStreamEnvironmentThemesUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("environmentThemesUpdated"),
  payload: ServerConfigEnvironmentThemesUpdatedPayload,
});
export type ServerConfigStreamEnvironmentThemesUpdatedEvent =
  typeof ServerConfigStreamEnvironmentThemesUpdatedEvent.Type;

export const ServerConfigUsageLimitSourcesUpdatedPayload = Schema.Struct({
  sources: UsageLimitSourceSnapshots,
});
export type ServerConfigUsageLimitSourcesUpdatedPayload =
  typeof ServerConfigUsageLimitSourcesUpdatedPayload.Type;

export const ServerConfigStreamUsageLimitSourcesUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("usageLimitSourcesUpdated"),
  payload: ServerConfigUsageLimitSourcesUpdatedPayload,
});
export type ServerConfigStreamUsageLimitSourcesUpdatedEvent =
  typeof ServerConfigStreamUsageLimitSourcesUpdatedEvent.Type;

export const ServerConfigStreamFeatureFlagsUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("featureFlagsUpdated"),
  payload: Schema.Struct({ featureFlags: FeatureFlagValues }),
});
export type ServerConfigStreamFeatureFlagsUpdatedEvent =
  typeof ServerConfigStreamFeatureFlagsUpdatedEvent.Type;

export const ServerConfigStreamEvent = Schema.Union([
  ServerConfigStreamSnapshotEvent,
  ServerConfigStreamKeybindingsUpdatedEvent,
  ServerConfigStreamProviderStatusesEvent,
  ServerConfigStreamSettingsUpdatedEvent,
  ServerConfigStreamEnvironmentThemesUpdatedEvent,
  ServerConfigStreamUsageLimitSourcesUpdatedEvent,
  ServerConfigStreamFeatureFlagsUpdatedEvent,
]);
export type ServerConfigStreamEvent = typeof ServerConfigStreamEvent.Type;

export const ServerSelfUpdateOutcome = Schema.Struct({
  id: TrimmedNonEmptyString,
  fromVersion: TrimmedNonEmptyString,
  targetVersion: TrimmedNonEmptyString,
  status: Schema.Literals(["committed", "rolled-back", "failed"]),
  reason: Schema.optionalKey(TrimmedNonEmptyString),
});
export type ServerSelfUpdateOutcome = typeof ServerSelfUpdateOutcome.Type;

export const ServerLifecycleReadyPayload = Schema.Struct({
  at: IsoDateTime,
  environment: ExecutionEnvironmentDescriptor,
  updateOutcome: Schema.optionalKey(ServerSelfUpdateOutcome),
});
export type ServerLifecycleReadyPayload = typeof ServerLifecycleReadyPayload.Type;

export const ServerLifecycleWelcomePayload = Schema.Struct({
  environment: ExecutionEnvironmentDescriptor,
  cwd: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  bootstrapStatus: Schema.optional(Schema.Literals(["pending", "complete"])),
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
  bootstrapProjectCreated: Schema.optional(Schema.Boolean),
  bootstrapThreadCreated: Schema.optional(Schema.Boolean),
});
export type ServerLifecycleWelcomePayload = typeof ServerLifecycleWelcomePayload.Type;

export const ServerLifecycleLegacyThreadMigrationPayload = Schema.Struct({
  status: Schema.Union([Schema.Literal("running"), Schema.Literal("complete")]),
  totalThreadCount: NonNegativeInt,
});
export type ServerLifecycleLegacyThreadMigrationPayload =
  typeof ServerLifecycleLegacyThreadMigrationPayload.Type;

export const ServerLifecycleStreamWelcomeEvent = Schema.Struct({
  version: Schema.Literal(1),
  sequence: NonNegativeInt,
  type: Schema.Literal("welcome"),
  payload: ServerLifecycleWelcomePayload,
});
export type ServerLifecycleStreamWelcomeEvent = typeof ServerLifecycleStreamWelcomeEvent.Type;

export const ServerLifecycleStreamReadyEvent = Schema.Struct({
  version: Schema.Literal(1),
  sequence: NonNegativeInt,
  type: Schema.Literal("ready"),
  payload: ServerLifecycleReadyPayload,
});
export type ServerLifecycleStreamReadyEvent = typeof ServerLifecycleStreamReadyEvent.Type;

export const ServerLifecycleStreamLegacyThreadMigrationEvent = Schema.Struct({
  version: Schema.Literal(1),
  sequence: NonNegativeInt,
  type: Schema.Literal("legacyThreadMigration"),
  payload: ServerLifecycleLegacyThreadMigrationPayload,
});
export type ServerLifecycleStreamLegacyThreadMigrationEvent =
  typeof ServerLifecycleStreamLegacyThreadMigrationEvent.Type;

export const ServerLifecycleStreamEvent = Schema.Union([
  ServerLifecycleStreamWelcomeEvent,
  ServerLifecycleStreamReadyEvent,
  ServerLifecycleStreamLegacyThreadMigrationEvent,
]);
export type ServerLifecycleStreamEvent = typeof ServerLifecycleStreamEvent.Type;

export const ServerProviderUpdatedPayload = Schema.Struct({
  providers: ServerProviders,
});
export type ServerProviderUpdatedPayload = typeof ServerProviderUpdatedPayload.Type;

export const ServerProviderUpdateInput = Schema.Struct({
  provider: ProviderDriverKind,
  targetVersion: Schema.optionalKey(TrimmedNonEmptyString),
  instanceId: Schema.optionalKey(ProviderInstanceId),
});
export type ServerProviderUpdateInput = typeof ServerProviderUpdateInput.Type;

export class ServerProviderUpdateError extends Schema.TaggedError<ServerProviderUpdateError>()(
  "ServerProviderUpdateError",
  {
    provider: ProviderDriverKind,
    reason: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider update failed for ${this.provider}: ${this.reason}`;
  }
}

export const ServerNpmReleaseInput = Schema.Struct({
  spec: Schema.String.check(
    Schema.isMaxLength(64),
    Schema.isPattern(/^(?:latest|nightly|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/),
  ),
});
export type ServerNpmReleaseInput = typeof ServerNpmReleaseInput.Type;

export const ServerNpmRelease = Schema.Struct({
  version: Schema.String,
  databaseMigration: Schema.optionalKey(Schema.Int),
});
export type ServerNpmRelease = typeof ServerNpmRelease.Type;

export class ServerNpmReleaseError extends Schema.TaggedError<ServerNpmReleaseError>()(
  "ServerNpmReleaseError",
  { reason: Schema.String },
) {
  override get message(): string {
    return `Could not check the configured npm registry: ${this.reason}`;
  }
}

export const ServerSelfUpdateInput = Schema.Struct({
  /** Exact npm version, never a dist-tag, so server and client agree on the request. */
  targetVersion: TrimmedNonEmptyString,
  /** Desktop-managed hosts move their app to this update track first. Sent only for a track switch. */
  channel: Schema.optionalKey(DesktopUpdateChannelSchema),
  /** The target release's highest migration; the host refuses to leave Nightly without it. */
  targetDatabaseMigration: Schema.optionalKey(Schema.Int),
});
export type ServerSelfUpdateInput = typeof ServerSelfUpdateInput.Type;

export const ServerSelfUpdateResult = Schema.Struct({
  targetVersion: TrimmedNonEmptyString,
  method: ServerSelfUpdateMethod,
  updateId: Schema.optionalKey(TrimmedNonEmptyString),
  desktopUpdateToken: Schema.optionalKey(TrimmedNonEmptyString),
});
export type ServerSelfUpdateResult = typeof ServerSelfUpdateResult.Type;

export const DesktopUpdateCommitInput = Schema.Struct({
  requestId: TrimmedNonEmptyString,
});
export type DesktopUpdateCommitInput = typeof DesktopUpdateCommitInput.Type;

export const ServerSelfUpdateProgressStage = Schema.Literals(["downloading", "installing"]);
export type ServerSelfUpdateProgressStage = typeof ServerSelfUpdateProgressStage.Type;

export const ServerSelfUpdateProgressEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("progress"),
    stage: ServerSelfUpdateProgressStage,
  }),
  Schema.Struct({
    type: Schema.Literal("complete"),
    result: ServerSelfUpdateResult,
  }),
]);
export type ServerSelfUpdateProgressEvent = typeof ServerSelfUpdateProgressEvent.Type;

export class ServerSelfUpdateError extends Schema.TaggedError<ServerSelfUpdateError>()(
  "ServerSelfUpdateError",
  {
    reason: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Server update failed: ${this.reason}`;
  }
}
