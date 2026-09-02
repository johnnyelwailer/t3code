// @effect-diagnostics nodeBuiltinImport:off - detecting bundled packs inside the app.asar requires an asar-aware fs call; Effect's FileSystem.exists is built on fs.access, which Electron's asar patch does not cover.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { parsePersistedServerObservabilitySettings } from "@t3tools/shared/serverSettings";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as SynchronizedRef from "effect/SynchronizedRef";

import serverPackageJson from "../../../server/package.json" with { type: "json" };

import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopServerExposure from "./DesktopServerExposure.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWslEnvironment from "../wsl/DesktopWslEnvironment.ts";
import * as DesktopWslServerTree from "../wsl/DesktopWslServerTree.ts";

export class DesktopBackendObservabilitySettingsReadError extends Schema.TaggedErrorClass<DesktopBackendObservabilitySettingsReadError>()(
  "DesktopBackendObservabilitySettingsReadError",
  {
    settingsPath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to read persisted backend observability settings at ${this.settingsPath}.`;
  }
}

export class DesktopBackendConfiguration extends Context.Service<
  DesktopBackendConfiguration,
  {
    readonly resolvePrimary: Effect.Effect<
      DesktopBackendManager.DesktopBackendStartConfig,
      PlatformError.PlatformError
    >;
    readonly resolveWsl: (input: {
      readonly port: number;
      readonly distro: string | null;
    }) => Effect.Effect<
      DesktopBackendManager.DesktopBackendStartConfig,
      PlatformError.PlatformError
    >;
    readonly resolvePrimaryLabel: Effect.Effect<string>;
  }
>()("@t3tools/desktop/backend/DesktopBackendConfiguration") {}

interface BackendObservabilitySettings {
  readonly otlpTracesUrl: Option.Option<string>;
  readonly otlpMetricsUrl: Option.Option<string>;
}

const emptyBackendObservabilitySettings: BackendObservabilitySettings = {
  otlpTracesUrl: Option.none(),
  otlpMetricsUrl: Option.none(),
};

const DESKTOP_BACKEND_ENV_NAMES = [
  "T3CODE_PORT",
  "T3CODE_MODE",
  "T3CODE_NO_BROWSER",
  "T3CODE_HOST",
  "T3CODE_DESKTOP_WS_URL",
  "T3CODE_DESKTOP_LAN_ACCESS",
  "T3CODE_DESKTOP_LAN_HOST",
  "T3CODE_DESKTOP_HTTPS_ENDPOINTS",
  "T3CODE_TAILSCALE_SERVE",
  "T3CODE_TAILSCALE_SERVE_PORT",
] as const;

const WSL_FORWARDED_ENV_NAMES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;

const WSL_SERVER_SYSTEM_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * A SQLite file this small has a header and no user data. A real workspace DB
 * is orders of magnitude larger, so this cleanly separates "the branded home
 * was created by a launch that found nothing" from "the branded home is in
 * use". Deliberately generous: 8 KiB is two SQLite pages.
 */
const EMPTY_STATE_DB_MAX_BYTES = 8 * 1024;

const fileSizeOrZero = (candidate: string): number => {
  try {
    return NodeFS.statSync(candidate).size;
  } catch {
    return 0;
  }
};

/**
 * Move a pre-branding home (`~/.t3`) into the branded one, once.
 *
 * A build with bundled packs stores state under
 * `<appData>/<userDataDirName>`, while an unbundled build uses `~/.t3`. Before
 * this migration existed, installing a branded build over an existing install
 * silently started with a BLANK workspace: the old database was never opened,
 * never migrated, and never surfaced — the app simply looked wiped.
 *
 * The move is a rename, so on the normal same-volume case it is instant even
 * with large `worktrees/` trees. Anything that already exists in the branded
 * home is left untouched, so a real branded workspace can never be clobbered.
 * A blank state DB left behind by such a first launch does not block adoption
 * — it is moved aside rather than deleted, because discarding user-adjacent
 * data on startup is never the right default.
 *
 * Returns the directory the backend should actually use. On any failure
 * (cross-device rename, permissions) it returns the legacy directory so the
 * user keeps a working app instead of an empty one.
 */
export const migrateLegacyHomeIfNeeded = (input: {
  readonly legacyDir: string;
  readonly brandedDir: string;
  readonly join: (first: string, ...segments: string[]) => string;
  readonly stamp: string;
}): string => {
  const { legacyDir, brandedDir, join, stamp } = input;
  if (legacyDir === brandedDir) return brandedDir;

  const legacyState = join(legacyDir, "userdata", "state.sqlite");
  if (fileSizeOrZero(legacyState) === 0) return brandedDir;

  const brandedUserdata = join(brandedDir, "userdata");
  const brandedStateBytes = fileSizeOrZero(join(brandedUserdata, "state.sqlite"));
  if (brandedStateBytes > EMPTY_STATE_DB_MAX_BYTES) return brandedDir;

  try {
    NodeFS.mkdirSync(brandedDir, { recursive: true });
    if (NodeFS.existsSync(brandedUserdata)) {
      NodeFS.renameSync(brandedUserdata, `${brandedUserdata}.empty-${stamp}`);
    }
    for (const entry of NodeFS.readdirSync(legacyDir)) {
      const target = join(brandedDir, entry);
      if (NodeFS.existsSync(target)) continue;
      NodeFS.renameSync(join(legacyDir, entry), target);
    }
    return brandedDir;
  } catch {
    return legacyDir;
  }
};

const backendChildEnvPatch = (): Record<string, string | undefined> =>
  Object.fromEntries(DESKTOP_BACKEND_ENV_NAMES.map((name) => [name, undefined]));

const ATLASSIAN_ENV_KEYS = [
  "T3TEAM_ATLASSIAN_CLIENT_ID",
  "T3WORK_ATLASSIAN_CLIENT_ID",
  "T3TEAM_ATLASSIAN_CLIENT_SECRET",
  "T3WORK_ATLASSIAN_CLIENT_SECRET",
  "T3TEAM_TEMPO_CLIENT_ID",
  "T3WORK_TEMPO_CLIENT_ID",
  "T3TEAM_TEMPO_CLIENT_SECRET",
  "T3WORK_TEMPO_CLIENT_SECRET",
  "T3TEAM_ATLASSIAN_SITE_URL",
  "T3WORK_ATLASSIAN_SITE_URL",
];

const ATLASSIAN_ENV_KEYS_SET = new Set(ATLASSIAN_ENV_KEYS);

function parseEnvLine(line: string): [key: string, value: string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  if (!ATLASSIAN_ENV_KEYS_SET.has(key)) return null;
  let value = trimmed.slice(eqIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

/**
 * Resolve one PEM bundle before the backend child starts. User-installed
 * certificates win, followed by certificates bundled in loose distribution
 * packs. NODE_EXTRA_CA_CERTS is read only during Node startup, so pack
 * activation is too late to establish trust for a provider's first request.
 */
const resolveExtraCaCerts = (homeDirectory: string, resourcesPath: string): string | undefined => {
  try {
    const fs = NodeFS;
    const path = NodePath;
    const explicit = process.env.NODE_EXTRA_CA_CERTS?.trim();
    if (explicit) return explicit;

    const certDirectories = [path.join(homeDirectory, ".t3", "userdata", "certs")];
    const packsDir = path.join(resourcesPath, "packs");
    if (fs.existsSync(packsDir)) {
      for (const packName of fs.readdirSync(packsDir).toSorted()) {
        const packCertsDir = path.join(packsDir, packName, "certs");
        if (fs.existsSync(packCertsDir)) certDirectories.push(packCertsDir);
      }
    }

    for (const certsDir of certDirectories) {
      if (!fs.existsSync(certsDir)) continue;
      const pemName = fs
        .readdirSync(certsDir)
        .filter((fileName) => fileName.toLowerCase().endsWith(".pem"))
        .toSorted()[0];
      if (pemName !== undefined) return path.join(certsDir, pemName);
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const getWslEnvEntryName = (entry: string): string => {
  const slashIndex = entry.indexOf("/");
  return slashIndex === -1 ? entry : entry.slice(0, slashIndex);
};

const mergeWslEnv = (
  existingWslEnv: string | undefined,
  forwardedEnvNames: ReadonlyArray<string>,
): string | undefined => {
  const existing = existingWslEnv?.trim() ?? "";
  const seenNames = new Set(
    existing
      .split(":")
      .map((entry) => getWslEnvEntryName(entry.trim()))
      .filter((name) => name.length > 0),
  );
  const additions = forwardedEnvNames.filter((name) => !seenNames.has(name));
  const parts = [existing, ...additions].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(":") : undefined;
};

const logBackendObservabilitySettingsReadFailure = (
  settingsPath: string,
  cause: PlatformError.PlatformError,
) => {
  const error = new DesktopBackendObservabilitySettingsReadError({ settingsPath, cause });
  return Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      component: "desktop-backend-configuration",
      error,
    }),
  );
};

function resourceMonitorBinaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "t3-resource-monitor.exe" : "t3-resource-monitor";
}

const resolveResourceMonitorPath = Effect.fn(
  "desktop.backendConfiguration.resolveResourceMonitorPath",
)(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const binaryName = resourceMonitorBinaryName(environment.platform);
  const candidates = environment.isDevelopment
    ? [
        environment.path.join(
          environment.rootDir,
          "native/resource-monitor/target/release",
          binaryName,
        ),
        environment.path.join(
          environment.rootDir,
          "native/resource-monitor/target/debug",
          binaryName,
        ),
      ]
    : environment.isPackaged
      ? [environment.path.join(environment.resourcesPath, "resource-monitor", binaryName)]
      : environment.resolveResourcePathCandidates(
          environment.path.join("resource-monitor", binaryName),
        );

  for (const candidate of candidates) {
    if (yield* fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
      return Option.some(candidate);
    }
  }

  return Option.none<string>();
});

const readPersistedBackendObservabilitySettings = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const raw = yield* fileSystem.readFileString(environment.serverSettingsPath).pipe(
    Effect.map(Option.some),
    Effect.catchTags({
      PlatformError: (cause) =>
        cause.reason._tag === "NotFound"
          ? Effect.succeed(Option.none())
          : logBackendObservabilitySettingsReadFailure(environment.serverSettingsPath, cause).pipe(
              Effect.as(Option.none()),
            ),
    }),
  );
  if (Option.isNone(raw)) {
    return emptyBackendObservabilitySettings;
  }

  const parsed = parsePersistedServerObservabilitySettings(raw.value);
  return {
    otlpTracesUrl: Option.fromNullishOr(parsed.otlpTracesUrl),
    otlpMetricsUrl: Option.fromNullishOr(parsed.otlpMetricsUrl),
  };
});

interface SharedBootstrapInput {
  readonly bootstrapToken: string;
  readonly observabilitySettings: BackendObservabilitySettings;
}

interface WslPreflightSuccess {
  readonly _tag: "Ready";
  readonly runningDistro: string;
  readonly windowsEntryPath: string;
  readonly linuxEntryPath: string;
  readonly nodePath: string;
  readonly resolvedPath: string;
  // Identifies the distro-local runtime cache selected from the packaged archive.
  readonly runtimeId?: string;
}

interface WslPreflightFailure {
  readonly _tag: "Failed";
  readonly reason: string;
  readonly fatal: boolean;
  readonly retryLimit?: number;
}

const WSL_TRANSIENT_PREFLIGHT_RETRY_LIMIT = 12;
const WSL_RUNTIME_ARCHIVE_NAME = "wsl-runtime.tar.gz";
const WSL_RUNTIME_ARCHIVE_HASH_NAME = `${WSL_RUNTIME_ARCHIVE_NAME}.sha256`;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export const parseWslRuntimeArchiveHash = (value: string): string | null => {
  const trimmed = value.trim();
  return SHA256_HEX_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
};

type FailedNodePtyResult = Extract<
  DesktopWslEnvironment.EnsureWslNodePtyResult,
  { readonly ok: false }
>;

const runWslPreflight = Effect.fn("desktop.backendConfiguration.wslPreflight")(function* (input: {
  readonly distro: string | null;
  readonly runtimeArchive: DesktopWslEnvironment.WslRuntimeArchive | null;
  readonly allowBuild: boolean;
}): Effect.fn.Return<
  WslPreflightSuccess | WslPreflightFailure,
  never,
  | DesktopEnvironment.DesktopEnvironment
  | DesktopWslEnvironment.DesktopWslEnvironment
  | DesktopWslServerTree.DesktopWslServerTree
  | FileSystem.FileSystem
> {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const wslEnv = yield* DesktopWslEnvironment.DesktopWslEnvironment;
  const wslServerTree = yield* DesktopWslServerTree.DesktopWslServerTree;
  const fileSystem = yield* FileSystem.FileSystem;

  const wslAvailable = yield* wslEnv.isAvailable;
  if (!wslAvailable) {
    return {
      _tag: "Failed",
      reason: "WSL is not available on this system",
      fatal: false,
    } as const;
  }

  const distroProbe = yield* wslEnv.probeDistros.pipe(
    Effect.map((distros) => ({ _tag: "Success", distros }) as const),
    Effect.catch((error) => Effect.succeed({ _tag: "Failure", error } as const)),
  );
  if (distroProbe._tag === "Failure") {
    return {
      _tag: "Failed",
      reason: `Unable to list WSL distributions: ${distroProbe.error.message}`,
      fatal: false,
    } as const;
  }

  const installedDistros = distroProbe.distros;
  const runningDistro = input.distro
    ? (installedDistros.find(
        (installed) => installed.name.toLowerCase() === input.distro?.toLowerCase(),
      )?.name ?? null)
    : (installedDistros.find((installed) => installed.isDefault)?.name ?? null);
  if (runningDistro === null) {
    return {
      _tag: "Failed",
      reason: input.distro
        ? `WSL distro is not installed: ${input.distro}`
        : installedDistros.length === 0
          ? "WSL has no installed distributions"
          : "WSL has no default distribution",
      fatal: true,
    } as const;
  }

  const nodePtyOptions = {
    allowBuild: input.allowBuild,
    nodeEngineRange: serverPackageJson.engines.node,
  };
  const failedNodePty = (result: FailedNodePtyResult) =>
    ({
      _tag: "Failed",
      reason: `WSL node-pty unavailable: ${result.reason}`,
      fatal: result.fatal,
      ...(result.retryLimit === undefined ? {} : { retryLimit: result.retryLimit }),
    }) as const;

  // The mounted server tree is the fallback runtime: the Windows-side copy the
  // distro reads over /mnt. Slower to launch from, but always installed.
  const resolveMountedAppRoot = Effect.gen(function* () {
    const serverTree = yield* wslServerTree.ensure;
    if (!serverTree.ok) {
      return { ok: false, reason: serverTree.reason, fatal: serverTree.fatal } as const;
    }
    const windowsEntryPath = environment.path.join(serverTree.root, "apps/server/dist/t3team-bin.mjs");
    const entryExists = yield* fileSystem
      .exists(windowsEntryPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!entryExists) {
      return {
        ok: false,
        reason: `missing server entry at ${windowsEntryPath}`,
        fatal: true,
      } as const;
    }
    const mountedAppRoot = yield* wslEnv.windowsToWslPath(runningDistro, serverTree.root);
    return Option.isNone(mountedAppRoot)
      ? ({
          ok: false,
          reason: `wslpath conversion failed for ${serverTree.root}`,
          fatal: false,
        } as const)
      : ({ ok: true, windowsEntryPath, linuxAppRoot: mountedAppRoot.value } as const);
  });

  // Set once a staged runtime has been ruled out by the probe, and carried
  // through the mounted attempt: if the mounted tree works the cache is the
  // broken part and gets invalidated, and if the mounted tree returns its own
  // fatal verdict the cached reason is the more actionable one to report.
  // A transient mounted failure is neither — it rules nothing out, so it stays
  // retryable and the staged verdict waits for an attempt that can answer.
  let stagedFailure:
    | { readonly runtimeId: string; readonly nodePty: FailedNodePtyResult }
    | undefined;

  if (input.runtimeArchive !== null) {
    const runtime = yield* wslEnv.prepareRuntime(runningDistro, input.runtimeArchive);
    if (runtime.ok) {
      const stagedNodePty = yield* wslEnv.ensureNodePty(
        runningDistro,
        runtime.linuxAppRoot,
        nodePtyOptions,
      );
      if (stagedNodePty.ok) {
        yield* wslServerTree.cleanupLegacy;
        return {
          _tag: "Ready",
          runningDistro,
          windowsEntryPath: environment.backendEntryPath,
          linuxEntryPath: `${runtime.linuxAppRoot}/apps/server/dist/t3team-bin.mjs`,
          nodePath: stagedNodePty.nodePath,
          resolvedPath: stagedNodePty.resolvedPath,
          runtimeId: input.runtimeArchive.runtimeId,
        } as const;
      }
      // A transport failure says nothing about the staged tree, so it is
      // retried against the same cache rather than spending a second probe on
      // the mounted tree and risking a needless reinstall.
      if (!stagedNodePty.fatal) return failedNodePty(stagedNodePty);
      yield* Effect.logWarning(
        "The staged WSL runtime could not load node-pty; retrying from the mounted server tree.",
        { reason: stagedNodePty.reason },
      );
      stagedFailure = { runtimeId: input.runtimeArchive.runtimeId, nodePty: stagedNodePty };
    } else {
      yield* Effect.logWarning(
        "Could not stage the WSL runtime; launching from the mounted server tree instead.",
        { reason: runtime.reason },
      );
    }
  }

  const mounted = yield* resolveMountedAppRoot;
  if (!mounted.ok) {
    return stagedFailure && mounted.fatal
      ? failedNodePty(stagedFailure.nodePty)
      : ({ _tag: "Failed", reason: mounted.reason, fatal: mounted.fatal } as const);
  }

  const nodePtyResult = yield* wslEnv.ensureNodePty(
    runningDistro,
    mounted.linuxAppRoot,
    nodePtyOptions,
  );
  if (!nodePtyResult.ok) {
    // Substituting the staged verdict for a transient mounted failure would
    // turn a retryable failure into a fatal one, ending the WSL attempt (and,
    // in wsl-only mode, persisting Windows) before the slow /mnt path had a
    // chance to answer and clear the bad cache.
    return failedNodePty(
      stagedFailure && nodePtyResult.fatal ? stagedFailure.nodePty : nodePtyResult,
    );
  }

  // The mounted tree runs what the cache could not, so the cache is the broken
  // copy: revoke its ready marker so the next launch reinstalls it instead of
  // reusing a tree that has already been proven unloadable.
  if (stagedFailure) {
    yield* wslEnv.invalidateRuntime(runningDistro, stagedFailure.runtimeId);
  }

  return {
    _tag: "Ready",
    runningDistro,
    windowsEntryPath: mounted.windowsEntryPath,
    linuxEntryPath: `${mounted.linuxAppRoot}/apps/server/dist/t3team-bin.mjs`,
    nodePath: nodePtyResult.nodePath,
    resolvedPath: nodePtyResult.resolvedPath,
  } as const;
});

const isLocalHostIpv4 = (ip: string): boolean => {
  const interfaces = NodeOS.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const entry of list) {
      const family = String(entry.family);
      if ((family === "IPv4" || family === "4") && entry.address === ip) return true;
    }
  }
  return false;
};

const buildObservabilityFragment = (observabilitySettings: BackendObservabilitySettings) => ({
  ...Option.match(observabilitySettings.otlpTracesUrl, {
    onNone: () => ({}),
    onSome: (otlpTracesUrl) => ({ otlpTracesUrl }),
  }),
  ...Option.match(observabilitySettings.otlpMetricsUrl, {
    onNone: () => ({}),
    onSome: (otlpMetricsUrl) => ({ otlpMetricsUrl }),
  }),
});

const resolveAtlassianEnvFromResources = Effect.fn(
  "desktop.backendConfiguration.resolveAtlassianEnvFromResources",
)(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const result: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = environment.path.join(environment.resourcesPath, fileName);
    const exists = yield* fileSystem.exists(filePath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) continue;

    const content = yield* fileSystem.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
    if (!content) continue;

    for (const line of content.split("\n")) {
      const parsed = parseEnvLine(line);
      if (parsed) {
        result[parsed[0]] = parsed[1];
      }
    }
  }

  return result;
});

const resolvePrimaryStartConfig = Effect.fn("desktop.backendConfiguration.resolvePrimary")(
  function* (
    input: SharedBootstrapInput & {
      readonly resourceMonitorPath: Option.Option<string>;
    },
  ): Effect.fn.Return<
    DesktopBackendManager.DesktopBackendStartConfig,
    never,
    | DesktopEnvironment.DesktopEnvironment
    | DesktopServerExposure.DesktopServerExposure
    | FileSystem.FileSystem
  > {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const backendExposure = yield* serverExposure.backendConfig;

    const packsDir = environment.isPackaged
      ? ([
          environment.path.join(environment.serverRoot, "apps", "desktop", "packs"),
          // Windows keeps the executable server in server.asar but ships
          // distribution packs as loose resources for inspection and runtime
          // loading. They therefore cannot be resolved below serverRoot.
          environment.path.join(environment.resourcesPath, "packs"),
        ].find((candidate) => NodeFS.existsSync(candidate)) ?? null)
      : null;
    // Electron's asar patch does not cover fs.access, so Effect's default
    // FileSystem.exists (built on access) reports false for paths inside the
    // app.asar even when present. existsSync is asar-aware.
    const hasBundledPacks = packsDir !== null && NodeFS.existsSync(packsDir);
    const backendEntryPath = hasBundledPacks
      ? environment.path.join(environment.serverRoot, "apps/server/dist/t3team-bin.mjs")
      : environment.backendEntryPath;

    const brandedHomeDir = hasBundledPacks
      ? environment.path.join(environment.appDataDirectory, environment.userDataDirName)
      : environment.baseDir;

    const explicitT3Home = process.env.T3CODE_HOME?.trim();
    // An explicit T3CODE_HOME is an operator decision and is never migrated.
    const resolvedHomeDir =
      explicitT3Home ??
      migrateLegacyHomeIfNeeded({
        legacyDir: environment.baseDir,
        brandedDir: brandedHomeDir,
        join: environment.path.join,
        stamp: `${input.bootstrapToken.slice(0, 8)}`,
      });

    const bootstrap = {
      mode: "desktop" as const,
      noBrowser: true,
      port: backendExposure.port,
      t3Home: resolvedHomeDir,
      host: backendExposure.bindHost,
      desktopBootstrapToken: input.bootstrapToken,
      tailscaleServeEnabled: backendExposure.tailscaleServeEnabled,
      tailscaleServePort: backendExposure.tailscaleServePort,
      desktopTelemetryFd: 4,
      desktopTelemetryControlFd: 5,
      ...Option.match(input.resourceMonitorPath, {
        onNone: () => ({}),
        onSome: (resourceMonitorPath) => ({ resourceMonitorPath }),
      }),
      ...buildObservabilityFragment(input.observabilitySettings),
    };

    const atlassianEnv = hasBundledPacks ? yield* resolveAtlassianEnvFromResources() : {};

    return {
      executablePath: process.execPath,
      args: [backendEntryPath, "--bootstrap-fd", "3"],
      entryPath: backendEntryPath,
      cwd: environment.backendCwd,
      env: {
        ...backendChildEnvPatch(),
        ELECTRON_RUN_AS_NODE: "1",
        // Secure corporate-CA fallback. Unlike NODE_TLS_REJECT_UNAUTHORIZED=0,
        // this keeps certificate verification enabled and adds the OS trust store.
        NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA?.trim() || "1",
        ...(hasBundledPacks && packsDir !== null ? { T3TEAM_PACKS_DIR: packsDir } : {}),
        ...atlassianEnv,
        ...(() => {
          const ca = resolveExtraCaCerts(environment.homeDirectory, environment.resourcesPath);
          return ca !== undefined ? { NODE_EXTRA_CA_CERTS: ca } : {};
        })(),
      },
      extendEnv: true,
      bootstrap,
      bootstrapDelivery: "fd3",
      httpBaseUrl: backendExposure.httpBaseUrl,
      captureOutput: true,
      preflightFailure: Option.none(),
    } satisfies DesktopBackendManager.DesktopBackendStartConfig;
  },
);

const resolveWslStartConfig = Effect.fn("desktop.backendConfiguration.resolveWsl")(function* (
  input: SharedBootstrapInput & {
    readonly port: number;
    readonly distro: string | null;
  },
): Effect.fn.Return<
  DesktopBackendManager.DesktopBackendStartConfig,
  never,
  | DesktopEnvironment.DesktopEnvironment
  | DesktopWslEnvironment.DesktopWslEnvironment
  | DesktopWslServerTree.DesktopWslServerTree
  | FileSystem.FileSystem
> {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const wslEnvironment = yield* DesktopWslEnvironment.DesktopWslEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;

  // Bind to 0.0.0.0 inside WSL so the backend is reachable both via
  // WSL2's automatic localhost forwarding (wslhost: Windows 127.0.0.1
  // -> WSL 127.0.0.1) AND via the distro's eth0 IP directly from
  // Windows. wslhost forwarding is unreliable on some Windows hosts:
  // the desktop's readiness probe and the renderer's saved-env-style
  // fetch both saw "Failed to fetch" when the backend only bound to
  // 127.0.0.1 inside WSL. Binding to 0.0.0.0 plus advertising the
  // WSL IP as the renderer-visible URL avoids that dependency.
  // Security-wise this is acceptable for the local-only WSL backend:
  // the network it exposes on is the WSL-vEthernet network, not the
  // LAN; the primary owns LAN exposure when the user opts in.
  const wslBindHost = "0.0.0.0";

  const bootstrap = {
    mode: "desktop" as const,
    noBrowser: true,
    port: input.port,
    host: wslBindHost,
    desktopBootstrapToken: input.bootstrapToken,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
    ...buildObservabilityFragment(input.observabilitySettings),
  };

  // The archive is the primary packaged WSL path: it installs directly into
  // the distro's ext4 filesystem. The server.asar extraction service is only
  // consulted lazily if the archive is unavailable or cannot be staged.
  const archivePath = environment.path.join(environment.resourcesPath, WSL_RUNTIME_ARCHIVE_NAME);
  const archiveHashPath = environment.path.join(
    environment.resourcesPath,
    WSL_RUNTIME_ARCHIVE_HASH_NAME,
  );

  const hasArchive = environment.isPackaged
    ? yield* fileSystem.exists(archivePath).pipe(Effect.orElseSucceed(() => false))
    : false;
  const archiveHash = hasArchive
    ? yield* fileSystem.readFileString(archiveHashPath).pipe(
        Effect.map(parseWslRuntimeArchiveHash),
        Effect.orElseSucceed(() => null),
      )
    : null;
  if (hasArchive && archiveHash === null) {
    yield* Effect.logWarning(
      "Ignoring the WSL runtime archive because its SHA-256 identity is missing or invalid; launching from the mounted server tree instead.",
      { hashPath: archiveHashPath },
    );
  }

  const preflight = yield* runWslPreflight({
    distro: input.distro,
    runtimeArchive:
      archiveHash === null
        ? null
        : {
            windowsPath: archivePath,
            // The verified archive bytes are the cache identity. Release builds
            // embed the release version and pnpm install metadata, so the
            // archive changes on every update even when application logic does
            // not. Later launches of that update still reuse this directory.
            runtimeId: `sha256-${archiveHash}`,
            sha256: archiveHash,
          },
    // Packaged builds ship a prebuilt Linux node-pty (built on Linux in CI and
    // attached to the Windows artifact — see build-desktop-artifact.ts), so the
    // WSL backend never needs a compiler, node-gyp, or network on first launch.
    // Compiling from source is a dev-only convenience: a checkout has no shipped
    // prebuilt, and developers have the toolchain. In packaged builds we instead
    // surface a clear diagnostic if the prebuilt can't load (unsupported
    // arch/distro), rather than silently dropping into a fragile runtime build.
    allowBuild: !environment.isPackaged,
  });

  const runningDistro = preflight._tag === "Ready" ? preflight.runningDistro : null;
  const distroForConfig = runningDistro ?? input.distro;

  const distroIp = yield* wslEnvironment.getDistroIp(distroForConfig);
  const usesSharedNetworkStack = Option.match(distroIp, {
    onNone: () => false,
    onSome: (ip) => isLocalHostIpv4(ip),
  });
  const rendererHost = usesSharedNetworkStack
    ? "127.0.0.1"
    : Option.getOrElse(distroIp, () => "127.0.0.1");
  const httpBaseUrl = new URL(`http://${rendererHost}:${input.port}`);

  const distroArgs = distroForConfig ? ["-d", distroForConfig] : [];
  const forwardedEnv: Record<string, string> = {};
  const forwardedEnvNames: string[] = [];
  for (const name of WSL_FORWARDED_ENV_NAMES) {
    const value = process.env[name];
    if (value !== undefined && value.length > 0) {
      forwardedEnv[name] = value;
      forwardedEnvNames.push(name);
    }
  }

  const parentEnvWithoutT3Home: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "T3CODE_HOME") continue;
    parentEnvWithoutT3Home[key] = value;
  }
  const wslEnv = mergeWslEnv(parentEnvWithoutT3Home.WSLENV, forwardedEnvNames);

  const baseConfig = {
    executablePath: "wsl.exe",
    entryPath:
      preflight._tag === "Ready" ? preflight.windowsEntryPath : environment.backendEntryPath,
    cwd: environment.backendCwd,
    env: {
      ...parentEnvWithoutT3Home,
      ...backendChildEnvPatch(),
      ...forwardedEnv,
      ...(wslEnv !== undefined ? { WSLENV: wslEnv } : {}),
    },
    extendEnv: false,
    bootstrap,
    bootstrapDelivery: "stdin" as const,
    httpBaseUrl,
    captureOutput: true,
    ...(runningDistro !== null ? { runningDistro } : {}),
  };

  const devUrlArgs = Option.match(environment.devServerUrl, {
    onNone: () => [] as ReadonlyArray<string>,
    onSome: (url) => ["--dev-url", url.href],
  });

  if (preflight._tag === "Failed") {
    const retryLimit =
      preflight.retryLimit ?? (preflight.fatal ? undefined : WSL_TRANSIENT_PREFLIGHT_RETRY_LIMIT);
    return {
      ...baseConfig,
      args: [...distroArgs, "--", "node", "--version"],
      preflightFailure: Option.some({
        reason: preflight.reason,
        fatal: preflight.fatal,
        ...(retryLimit === undefined ? {} : { retryLimit }),
      }),
    } satisfies DesktopBackendManager.DesktopBackendStartConfig;
  }

  const lastSlash = preflight.nodePath.lastIndexOf("/");
  const nodeBinDir = lastSlash > 0 ? preflight.nodePath.slice(0, lastSlash) : "/usr/bin";
  const launchPath = `${nodeBinDir}:${WSL_SERVER_SYSTEM_PATH}:${preflight.resolvedPath}`;

  return {
    ...baseConfig,
    args: [
      ...distroArgs,
      "--exec",
      "env",
      `PATH=${launchPath}`,
      preflight.nodePath,
      preflight.linuxEntryPath,
      "--bootstrap-fd",
      "0",
      ...devUrlArgs,
    ],
    preflightFailure: Option.none(),
    ...(preflight.runtimeId === undefined ? {} : { wslRuntimeId: preflight.runtimeId }),
  } satisfies DesktopBackendManager.DesktopBackendStartConfig;
});

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
  const wslEnvironment = yield* DesktopWslEnvironment.DesktopWslEnvironment;
  const wslServerTree = yield* DesktopWslServerTree.DesktopWslServerTree;
  const settings = yield* DesktopAppSettings.DesktopAppSettings;
  const crypto = yield* Crypto.Crypto;
  const tokenRef = yield* SynchronizedRef.make(Option.none<string>());
  const getOrCreateBootstrapToken = SynchronizedRef.modifyEffect(tokenRef, (current) =>
    Option.match(current, {
      onSome: (token) => Effect.succeed([token, current] as const),
      onNone: () =>
        crypto.randomBytes(24).pipe(
          Effect.map((bytes) => {
            const token = Encoding.encodeHex(bytes);
            return [token, Option.some(token)] as const;
          }),
        ),
    }),
  );

  const sharedInputs = Effect.gen(function* () {
    const bootstrapToken = yield* getOrCreateBootstrapToken;
    const observabilitySettings = yield* readPersistedBackendObservabilitySettings.pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
    );
    return { bootstrapToken, observabilitySettings } satisfies SharedBootstrapInput;
  });

  const buildWslPrimaryConfig = Effect.gen(function* () {
    const backendExposure = yield* serverExposure.backendConfig;
    const persistedSettings = yield* settings.get;
    const shared = yield* sharedInputs;
    yield* wslEnvironment.preWarm(persistedSettings.wslDistro);
    return yield* resolveWslStartConfig({
      ...shared,
      port: backendExposure.port,
      distro: persistedSettings.wslDistro,
    }).pipe(
      Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
      Effect.provideService(DesktopWslEnvironment.DesktopWslEnvironment, wslEnvironment),
      Effect.provideService(DesktopWslServerTree.DesktopWslServerTree, wslServerTree),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
    );
  });

  const buildWindowsPrimaryConfig = Effect.gen(function* () {
    const shared = yield* sharedInputs;
    const resourceMonitorPath = yield* resolveResourceMonitorPath().pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
    );
    return yield* resolvePrimaryStartConfig({ ...shared, resourceMonitorPath }).pipe(
      Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
      Effect.provideService(DesktopServerExposure.DesktopServerExposure, serverExposure),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
    );
  });

  const describePrimary = Effect.gen(function* () {
    const persistedSettings = yield* settings.get;
    const wslRequested = persistedSettings.wslOnly && persistedSettings.wslBackendEnabled;
    const useWsl = wslRequested && (yield* wslEnvironment.isAvailable);
    return { useWsl, wslRequested, distro: persistedSettings.wslDistro };
  });

  return DesktopBackendConfiguration.of({
    resolvePrimary: Effect.gen(function* () {
      const { useWsl, wslRequested } = yield* describePrimary;
      if (useWsl) {
        return yield* buildWslPrimaryConfig;
      }
      if (wslRequested) {
        yield* Effect.logWarning(
          "WSL-only backend requested but WSL is unavailable; starting the Windows primary instead.",
        );
      }
      return yield* buildWindowsPrimaryConfig;
    }).pipe(Effect.withSpan("desktop.backendConfiguration.resolvePrimary")),
    resolvePrimaryLabel: Effect.gen(function* () {
      const { useWsl, distro } = yield* describePrimary;
      if (!useWsl) {
        return environment.platform === "win32" ? "Windows" : "Local environment";
      }
      return distro ? `WSL (${distro})` : "WSL";
    }).pipe(Effect.withSpan("desktop.backendConfiguration.resolvePrimaryLabel")),
    resolveWsl: (input) =>
      Effect.gen(function* () {
        const shared = yield* sharedInputs;
        return yield* resolveWslStartConfig({ ...shared, ...input }).pipe(
          Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
          Effect.provideService(DesktopWslEnvironment.DesktopWslEnvironment, wslEnvironment),
          Effect.provideService(DesktopWslServerTree.DesktopWslServerTree, wslServerTree),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        );
      }).pipe(
        Effect.withSpan("desktop.backendConfiguration.resolveWsl", {
          attributes: { port: input.port, distro: input.distro ?? null },
        }),
      ),
  });
});

export const layer = Layer.effect(DesktopBackendConfiguration, make);
