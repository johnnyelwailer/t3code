import * as NetService from "@t3tools/shared/Net";
import { parsePersistedServerObservabilitySettings } from "@t3tools/shared/serverSettings";
import { DesktopBackendBootstrap, PortSchema } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as LogLevel from "effect/LogLevel";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { Argument, Flag } from "effect/unstable/cli";

import { readBootstrapEnvelope } from "../bootstrap.ts";
import * as ServerConfig from "../config.ts";
import { expandHomePath, resolveBaseDir } from "../os-jank.ts";
import { distributionBranding } from "../t3team-distribution.ts";

export const modeFlag = Flag.choice("mode", ServerConfig.RuntimeMode.literals).pipe(
  Flag.withDescription("Runtime mode. `desktop` keeps loopback defaults unless overridden."),
  Flag.optional,
);
export const portFlag = Flag.integer("port").pipe(
  Flag.withSchema(PortSchema),
  Flag.withDescription("Port for the HTTP/WebSocket server."),
  Flag.optional,
);
export const hostFlag = Flag.string("host").pipe(
  Flag.withDescription("Host/interface to bind (for example 127.0.0.1, 0.0.0.0, or a Tailnet IP)."),
  Flag.optional,
);
export const baseDirFlag = Flag.string("base-dir").pipe(
  Flag.withDescription(
    "Explicit T3 Code data directory; runtime state is stored under userdata (equivalent to T3CODE_HOME).",
  ),
  Flag.optional,
);
export const devUrlFlag = Flag.string("dev-url").pipe(
  Flag.withSchema(Schema.URLFromString),
  Flag.withDescription("Dev web URL to proxy/redirect to (equivalent to VITE_DEV_SERVER_URL)."),
  Flag.optional,
);
export const noBrowserFlag = Flag.boolean("no-browser").pipe(
  Flag.withDescription("Disable automatic browser opening."),
  Flag.optional,
);
export const bootstrapFdFlag = Flag.integer("bootstrap-fd").pipe(
  Flag.withSchema(Schema.Int),
  Flag.withDescription("Read one-time bootstrap secrets from the given file descriptor."),
  Flag.optional,
);
export const autoBootstrapProjectFromCwdFlag = Flag.boolean("auto-bootstrap-project-from-cwd").pipe(
  Flag.withDescription(
    "Create a project for the current working directory on startup when missing.",
  ),
  Flag.optional,
);
export const logWebSocketEventsFlag = Flag.boolean("log-websocket-events").pipe(
  Flag.withDescription(
    "Emit server-side logs for outbound WebSocket push traffic (equivalent to T3CODE_LOG_WS_EVENTS).",
  ),
  Flag.withAlias("log-ws-events"),
  Flag.optional,
);
export const tailscaleServeFlag = Flag.boolean("tailscale-serve").pipe(
  Flag.withDescription(
    "Configure Tailscale Serve to expose this backend over HTTPS on the Tailnet.",
  ),
  Flag.optional,
);
export const tailscaleServePortFlag = Flag.integer("tailscale-serve-port").pipe(
  Flag.withSchema(PortSchema),
  Flag.withDescription("HTTPS port for Tailscale Serve when --tailscale-serve is enabled."),
  Flag.optional,
);

/**
 * Decodes either the `"unlimited"` sentinel `WorkflowEphemeralConcurrencyPolicy`'s fields already
 * accept, or a positive integer. Nonsense values (0, negative, non-numeric) fail decode with a
 * message the CLI surfaces as a startup error, rather than silently falling back. Shared by both
 * ephemeral-workflow limit flags below — only the label in the error message differs.
 */
const positiveIntegerOrUnlimitedFromString = (label: string) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.Union([Schema.Literal("unlimited"), Schema.Int]),
      // Explicit type args: without them, TS infers the decode/encode pair's shared type
      // independently per property and narrows to `number` (dropping the `"unlimited"` arm)
      // rather than unifying to the declared union — pin it explicitly instead of fighting
      // inference.
      SchemaTransformation.transformOrFail<"unlimited" | number, string>({
        decode: (value) => {
          const trimmed = value.trim();
          if (trimmed.toLowerCase() === "unlimited") {
            return Effect.succeed("unlimited" as const);
          }
          const parsed = Number(trimmed);
          if (!Number.isInteger(parsed) || parsed < 1) {
            return Effect.fail(
              new SchemaIssue.InvalidValue({
                message: `${label} must be a positive integer or "unlimited".`,
              }),
            );
          }
          return Effect.succeed(parsed);
        },
        encode: (value) => Effect.succeed(String(value)),
      }),
    ),
  );

const EphemeralWorkflowMaxActiveStepsFromString = positiveIntegerOrUnlimitedFromString(
  "Ephemeral workflow max active steps",
);
const EphemeralWorkflowMaxLiveRunsFromString = positiveIntegerOrUnlimitedFromString(
  "Ephemeral workflow max live runs",
);

export const ephemeralWorkflowMaxActiveStepsFlag = Flag.string(
  "ephemeral-workflow-max-active-steps",
).pipe(
  Flag.withSchema(EphemeralWorkflowMaxActiveStepsFromString),
  Flag.withDescription(
    'Max concurrent ephemeral-workflow steps admitted at once, or "unlimited" (equivalent to ' +
      "T3CODE_EPHEMERAL_WORKFLOW_MAX_ACTIVE_STEPS). Wins over any pack-provided policy.",
  ),
  Flag.optional,
);

export const ephemeralWorkflowMaxLiveRunsFlag = Flag.string(
  "ephemeral-workflow-max-live-runs",
).pipe(
  Flag.withSchema(EphemeralWorkflowMaxLiveRunsFromString),
  Flag.withDescription(
    "Max live ephemeral workflow runs (running/suspended/sleeping/paused) per launching thread, " +
      'or "unlimited" (equivalent to T3CODE_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS). Wins over any ' +
      "pack-provided policy.",
  ),
  Flag.optional,
);

const EnvServerConfig = Config.all({
  logLevel: Config.logLevel("T3CODE_LOG_LEVEL").pipe(Config.withDefault("Info")),
  traceMinLevel: Config.logLevel("T3CODE_TRACE_MIN_LEVEL").pipe(Config.withDefault("Info")),
  traceTimingEnabled: Config.boolean("T3CODE_TRACE_TIMING_ENABLED").pipe(Config.withDefault(true)),
  traceFile: Config.string("T3CODE_TRACE_FILE").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  traceMaxBytes: Config.int("T3CODE_TRACE_MAX_BYTES").pipe(Config.withDefault(10 * 1024 * 1024)),
  traceMaxFiles: Config.int("T3CODE_TRACE_MAX_FILES").pipe(Config.withDefault(10)),
  traceBatchWindowMs: Config.int("T3CODE_TRACE_BATCH_WINDOW_MS").pipe(Config.withDefault(1_000)),
  otlpTracesUrl: Config.string("T3CODE_OTLP_TRACES_URL").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  otlpMetricsUrl: Config.string("T3CODE_OTLP_METRICS_URL").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  otlpExportIntervalMs: Config.int("T3CODE_OTLP_EXPORT_INTERVAL_MS").pipe(
    Config.withDefault(10_000),
  ),
  otlpServiceName: Config.string("T3CODE_OTLP_SERVICE_NAME").pipe(Config.withDefault("t3-server")),
  mode: Config.schema(ServerConfig.RuntimeMode, "T3CODE_MODE").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  port: Config.port("T3CODE_PORT").pipe(Config.option, Config.map(Option.getOrUndefined)),
  host: Config.string("T3CODE_HOST").pipe(Config.option, Config.map(Option.getOrUndefined)),
  t3Home: Config.string("T3CODE_HOME").pipe(Config.option, Config.map(Option.getOrUndefined)),
  devUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option, Config.map(Option.getOrUndefined)),
  devAllowedOrigins: Config.string("T3CODE_DEV_ALLOWED_ORIGINS").pipe(
    Config.withDefault(""),
    Config.map((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ),
  noBrowser: Config.boolean("T3CODE_NO_BROWSER").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  bootstrapFd: Config.int("T3CODE_BOOTSTRAP_FD").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  autoBootstrapProjectFromCwd: Config.boolean("T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  logWebSocketEvents: Config.boolean("T3CODE_LOG_WS_EVENTS").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  tailscaleServeEnabled: Config.boolean("T3CODE_TAILSCALE_SERVE").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  tailscaleServePort: Config.port("T3CODE_TAILSCALE_SERVE_PORT").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
});

export interface CliServerFlags {
  readonly mode: Option.Option<ServerConfig.RuntimeMode>;
  readonly port: Option.Option<number>;
  readonly host: Option.Option<string>;
  readonly baseDir: Option.Option<string>;
  readonly cwd: Option.Option<string>;
  readonly devUrl: Option.Option<URL>;
  readonly noBrowser: Option.Option<boolean>;
  readonly bootstrapFd: Option.Option<number>;
  readonly autoBootstrapProjectFromCwd: Option.Option<boolean>;
  readonly logWebSocketEvents: Option.Option<boolean>;
  readonly tailscaleServeEnabled: Option.Option<boolean>;
  readonly tailscaleServePort: Option.Option<number>;
  /** Optional: only `cli/server.ts`/`cli/t3team-server.ts` read these (via
   * `resolveEphemeralWorkflowMaxActiveStepsOverride`/`resolveEphemeralWorkflowMaxLiveRunsOverride`),
   * so they stay out of `resolveServerConfig` and the exhaustive `ServerConfig` context shape
   * every other flag here feeds into. */
  readonly ephemeralWorkflowMaxActiveSteps?: Option.Option<number | "unlimited">;
  readonly ephemeralWorkflowMaxLiveRuns?: Option.Option<number | "unlimited">;
}

export interface CliAuthLocationFlags {
  readonly baseDir: Option.Option<string>;
  readonly devUrl?: Option.Option<URL>;
}

export const sharedServerLocationFlags = {
  baseDir: baseDirFlag,
  devUrl: devUrlFlag,
} as const;

export const projectLocationFlags = {
  baseDir: baseDirFlag,
} as const;

export const sharedServerCommandFlags = {
  mode: modeFlag,
  port: portFlag,
  host: hostFlag,
  baseDir: baseDirFlag,
  cwd: Argument.string("cwd").pipe(
    Argument.withDescription(
      "Working directory for provider sessions (defaults to the current directory).",
    ),
    Argument.optional,
  ),
  devUrl: devUrlFlag,
  noBrowser: noBrowserFlag,
  bootstrapFd: bootstrapFdFlag,
  autoBootstrapProjectFromCwd: autoBootstrapProjectFromCwdFlag,
  logWebSocketEvents: logWebSocketEventsFlag,
  tailscaleServeEnabled: tailscaleServeFlag,
  tailscaleServePort: tailscaleServePortFlag,
  ephemeralWorkflowMaxActiveSteps: ephemeralWorkflowMaxActiveStepsFlag,
  ephemeralWorkflowMaxLiveRuns: ephemeralWorkflowMaxLiveRunsFlag,
} as const;

export const authLocationFlags = sharedServerLocationFlags;

const resolveOptionPrecedence = <Value>(
  ...values: ReadonlyArray<Option.Option<Value>>
): Option.Option<Value> => Option.firstSomeOf(values);

/**
 * CLI flag → env var precedence for the ephemeral-workflow step-admission override, on the exact
 * shape `resolveServerConfig` uses for every other flag here (`Flag` + a `Config` env binding +
 * `resolveOptionPrecedence`/`Option.firstSomeOf`). Kept separate from `resolveServerConfig`
 * itself: nothing in the generic `ServerConfig` context needs this value, only the two CLI entry
 * points (`cli/server.ts`, `cli/t3team-server.ts`) that call `setWorkflowEphemeralConcurrencyPolicy`.
 *
 * Returns `undefined` when the operator expressed no preference — the caller must then leave
 * whatever pack policy (or the core default) already in effect alone, rather than resolving a
 * synthetic fallback here that would silently clobber it.
 */
export const resolveEphemeralWorkflowMaxActiveStepsOverride = Effect.fn(function* (
  flags: Pick<CliServerFlags, "ephemeralWorkflowMaxActiveSteps">,
) {
  const envValue = yield* Config.schema(
    EphemeralWorkflowMaxActiveStepsFromString,
    "T3CODE_EPHEMERAL_WORKFLOW_MAX_ACTIVE_STEPS",
  ).pipe(Config.option, Config.map(Option.getOrUndefined));
  return Option.getOrUndefined(
    resolveOptionPrecedence(
      flags.ephemeralWorkflowMaxActiveSteps ?? Option.none(),
      Option.fromUndefinedOr(envValue),
    ),
  );
});

/**
 * Same precedence and shape as `resolveEphemeralWorkflowMaxActiveStepsOverride` above, for the
 * per-launching-thread ephemeral run-count cap (`T3TEAM_EPHEMERAL_RUN_CAP`,
 * `t3team-toolBrokerWorkflowRunTools.ts`) — PJ's original directive ("run cap of 8 should
 * definitely not be hardcoded") applies to this limit too, not only to `maxActiveSteps`.
 */
export const resolveEphemeralWorkflowMaxLiveRunsOverride = Effect.fn(function* (
  flags: Pick<CliServerFlags, "ephemeralWorkflowMaxLiveRuns">,
) {
  const envValue = yield* Config.schema(
    EphemeralWorkflowMaxLiveRunsFromString,
    "T3CODE_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS",
  ).pipe(Config.option, Config.map(Option.getOrUndefined));
  return Option.getOrUndefined(
    resolveOptionPrecedence(
      flags.ephemeralWorkflowMaxLiveRuns ?? Option.none(),
      Option.fromUndefinedOr(envValue),
    ),
  );
});

const loadPersistedObservabilitySettings = Effect.fn(function* (settingsPath: string) {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(settingsPath).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return { otlpTracesUrl: undefined, otlpMetricsUrl: undefined };
  }

  const raw = yield* fs.readFileString(settingsPath).pipe(Effect.orElseSucceed(() => ""));
  return parsePersistedServerObservabilitySettings(raw);
});

export const resolveServerConfig = (
  flags: CliServerFlags,
  cliLogLevel: Option.Option<LogLevel.LogLevel>,
  options?: {
    readonly startupPresentation?: ServerConfig.StartupPresentation;
  },
) =>
  Effect.gen(function* () {
    const { findAvailablePort } = yield* NetService.NetService;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const env = yield* EnvServerConfig;
    const normalizedFlags = {
      mode: flags.mode ?? Option.none(),
      port: flags.port ?? Option.none(),
      host: flags.host ?? Option.none(),
      baseDir: flags.baseDir ?? Option.none(),
      cwd: flags.cwd ?? Option.none(),
      devUrl: flags.devUrl ?? Option.none(),
      noBrowser: flags.noBrowser ?? Option.none(),
      bootstrapFd: flags.bootstrapFd ?? Option.none(),
      autoBootstrapProjectFromCwd: flags.autoBootstrapProjectFromCwd ?? Option.none(),
      logWebSocketEvents: flags.logWebSocketEvents ?? Option.none(),
      tailscaleServeEnabled: flags.tailscaleServeEnabled ?? Option.none(),
      tailscaleServePort: flags.tailscaleServePort ?? Option.none(),
    } satisfies CliServerFlags;
    const bootstrapFd = Option.getOrUndefined(normalizedFlags.bootstrapFd) ?? env.bootstrapFd;
    const bootstrapEnvelope =
      bootstrapFd !== undefined
        ? yield* readBootstrapEnvelope(DesktopBackendBootstrap, bootstrapFd)
        : Option.none();
    const bootstrap = Option.getOrUndefined(bootstrapEnvelope);

    const mode: ServerConfig.RuntimeMode = Option.getOrElse(
      resolveOptionPrecedence(
        normalizedFlags.mode,
        Option.fromUndefinedOr(env.mode),
        Option.fromUndefinedOr(bootstrap?.mode),
      ),
      () => "web",
    );

    const port = yield* Option.match(
      resolveOptionPrecedence(
        normalizedFlags.port,
        Option.fromUndefinedOr(env.port),
        Option.fromUndefinedOr(bootstrap?.port),
      ),
      {
        onSome: (value) => Effect.succeed(value),
        onNone: () => {
          if (mode === "desktop") {
            return Effect.succeed(ServerConfig.DEFAULT_PORT);
          }
          return findAvailablePort(ServerConfig.DEFAULT_PORT);
        },
      },
    );
    const devUrl = Option.getOrElse(
      resolveOptionPrecedence(normalizedFlags.devUrl, Option.fromUndefinedOr(env.devUrl)),
      () => undefined,
    );
    const explicitBaseDir = resolveOptionPrecedence(
      normalizedFlags.baseDir,
      Option.fromUndefinedOr(env.t3Home),
    ).pipe(Option.filter((value) => value.trim().length > 0));
    const distroDir = distributionBranding?.userDataDirName;
    const defaultDirName = distroDir
      ? distroDir.startsWith(".")
        ? distroDir
        : `.${distroDir}`
      : undefined;
    const baseDir = yield* resolveBaseDir(
      Option.getOrUndefined(
        resolveOptionPrecedence(explicitBaseDir, Option.fromUndefinedOr(bootstrap?.t3Home)),
      ),
      defaultDirName,
    );
    const rawCwd = Option.getOrElse(normalizedFlags.cwd, () => process.cwd());
    const cwd = path.resolve(yield* expandHomePath(rawCwd.trim()));
    yield* fs.makeDirectory(cwd, { recursive: true });
    const derivedPaths = yield* ServerConfig.deriveServerPaths(baseDir, devUrl, {
      baseDirIsExplicit: Option.isSome(explicitBaseDir),
    });
    yield* ServerConfig.ensureServerDirectories(derivedPaths);
    const persistedObservabilitySettings = yield* loadPersistedObservabilitySettings(
      derivedPaths.settingsPath,
    );
    const serverTracePath = env.traceFile ?? derivedPaths.serverTracePath;
    yield* fs.makeDirectory(path.dirname(serverTracePath), { recursive: true });
    const startupPresentation = options?.startupPresentation ?? "browser";
    const isHeadlessStartup = startupPresentation === "headless";
    const noBrowser = Option.getOrElse(
      resolveOptionPrecedence(
        isHeadlessStartup ? Option.some(true) : Option.none(),
        normalizedFlags.noBrowser,
        Option.fromUndefinedOr(env.noBrowser),
        Option.fromUndefinedOr(bootstrap?.noBrowser),
      ),
      () => mode === "desktop",
    );
    const desktopBootstrapToken = bootstrap?.desktopBootstrapToken;
    const desktopTelemetryFd = bootstrap?.desktopTelemetryFd;
    const desktopTelemetryControlFd = bootstrap?.desktopTelemetryControlFd;
    const resourceMonitorPath = bootstrap?.resourceMonitorPath;
    // An explicit request (CLI flag or env var) must win over the headless
    // startup's implicit "don't auto-bootstrap" default — otherwise
    // `serve --auto-bootstrap-project-from-cwd` (and its env-var form) is a
    // silent no-op, since `serve` always resolves a headless
    // `startupPresentation`. The headless default only applies when neither
    // source expressed an explicit preference.
    const autoBootstrapProjectFromCwd = Option.getOrElse(
      resolveOptionPrecedence(
        normalizedFlags.autoBootstrapProjectFromCwd,
        Option.fromUndefinedOr(env.autoBootstrapProjectFromCwd),
        isHeadlessStartup ? Option.some(false) : Option.none(),
      ),
      () => mode === "web",
    );
    const logWebSocketEvents = Option.getOrElse(
      resolveOptionPrecedence(
        normalizedFlags.logWebSocketEvents,
        Option.fromUndefinedOr(env.logWebSocketEvents),
      ),
      () => Boolean(devUrl),
    );
    const tailscaleServeEnabled = Option.getOrElse(
      resolveOptionPrecedence(
        normalizedFlags.tailscaleServeEnabled,
        Option.fromUndefinedOr(env.tailscaleServeEnabled),
        Option.fromUndefinedOr(bootstrap?.tailscaleServeEnabled),
      ),
      () => false,
    );
    const tailscaleServePort = Option.getOrElse(
      resolveOptionPrecedence(
        normalizedFlags.tailscaleServePort,
        Option.fromUndefinedOr(env.tailscaleServePort),
        Option.fromUndefinedOr(bootstrap?.tailscaleServePort),
      ),
      () => 443,
    );
    const staticDir = devUrl ? undefined : yield* ServerConfig.resolveStaticDir();
    const host = Option.getOrElse(
      resolveOptionPrecedence(
        normalizedFlags.host,
        Option.fromUndefinedOr(env.host),
        Option.fromUndefinedOr(bootstrap?.host),
      ),
      () => (mode === "desktop" ? "127.0.0.1" : undefined),
    );
    const logLevel = Option.getOrElse(cliLogLevel, () => env.logLevel);

    const config: ServerConfig.ServerConfig["Service"] = {
      logLevel,
      traceMinLevel: env.traceMinLevel,
      traceTimingEnabled: env.traceTimingEnabled,
      traceBatchWindowMs: env.traceBatchWindowMs,
      traceMaxBytes: env.traceMaxBytes,
      traceMaxFiles: env.traceMaxFiles,
      otlpTracesUrl:
        env.otlpTracesUrl ??
        bootstrap?.otlpTracesUrl ??
        persistedObservabilitySettings.otlpTracesUrl,
      otlpMetricsUrl:
        env.otlpMetricsUrl ??
        bootstrap?.otlpMetricsUrl ??
        persistedObservabilitySettings.otlpMetricsUrl,
      otlpExportIntervalMs: env.otlpExportIntervalMs,
      otlpServiceName: env.otlpServiceName,
      mode,
      port,
      cwd,
      baseDir,
      ...derivedPaths,
      serverTracePath,
      host,
      staticDir,
      devUrl,
      devAllowedOrigins: env.devAllowedOrigins,
      noBrowser,
      startupPresentation,
      desktopBootstrapToken,
      desktopTelemetryFd,
      desktopTelemetryControlFd,
      resourceMonitorPath,
      autoBootstrapProjectFromCwd,
      logWebSocketEvents,
      tailscaleServeEnabled,
      tailscaleServePort,
    };

    return config;
  });

export const resolveCliAuthConfig = (
  flags: CliAuthLocationFlags,
  cliLogLevel: Option.Option<LogLevel.LogLevel>,
) =>
  resolveServerConfig(
    {
      mode: Option.none(),
      port: Option.none(),
      host: Option.none(),
      baseDir: flags.baseDir,
      cwd: Option.none(),
      devUrl: flags.devUrl ?? Option.none(),
      noBrowser: Option.none(),
      bootstrapFd: Option.none(),
      autoBootstrapProjectFromCwd: Option.none(),
      logWebSocketEvents: Option.none(),
      tailscaleServeEnabled: Option.none(),
      tailscaleServePort: Option.none(),
    },
    cliLogLevel,
  );

const DurationShorthandPattern = /^(?<value>\d+)(?<unit>ms|s|m|h|d|w)$/i;

const parseDurationInput = (value: string): Duration.Duration | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const shorthand = DurationShorthandPattern.exec(trimmed);
  const normalizedInput = shorthand?.groups
    ? (() => {
        const amountText = shorthand.groups.value;
        const unitText = shorthand.groups.unit;
        if (typeof amountText !== "string" || typeof unitText !== "string") {
          return null;
        }

        const amount = Number.parseInt(amountText, 10);
        if (!Number.isFinite(amount)) return null;

        switch (unitText.toLowerCase()) {
          case "ms":
            return `${amount} millis`;
          case "s":
            return `${amount} seconds`;
          case "m":
            return `${amount} minutes`;
          case "h":
            return `${amount} hours`;
          case "d":
            return `${amount} days`;
          case "w":
            return `${amount} weeks`;
          default:
            return null;
        }
      })()
    : (trimmed as Duration.Input);

  if (normalizedInput === null) return null;

  const decoded = Duration.fromInput(normalizedInput as Duration.Input);
  return Option.isSome(decoded) ? decoded.value : null;
};

export const DurationFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Duration,
    SchemaTransformation.transformOrFail({
      decode: (value) => {
        const duration = parseDurationInput(value);
        if (duration !== null) {
          return Effect.succeed(duration);
        }
        return Effect.fail(
          new SchemaIssue.InvalidValue({
            message: "Invalid duration. Use values like 5m, 1h, 30d, or 15 minutes.",
          }),
        );
      },
      encode: (duration) => Effect.succeed(Duration.format(duration)),
    }),
  ),
);
