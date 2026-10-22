// @effect-diagnostics nodeBuiltinImport:off - OS probing is intentionally host-native.
import * as HostProcess from "@t3tools/shared/HostProcess";
import {
  listLoginShellCandidates,
  mergePathEntries,
  readEnvironmentFromLoginShell,
  readPathFromLaunchctl,
  resolveKnownPosixCliDirs,
  resolveWindowsEnvironment,
  setWindowsPath,
} from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";

function logPathHydrationWarning(message: string, error?: unknown): void {
  process.stderr.write(
    `[server] ${message} ${error instanceof Error ? error.message : (error ?? "")}\n`,
  );
}

export function hydratePosixPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  options: {
    /** t3team: test seam; overrides the login-shell read with a PATH-only reader. */
    readonly readLoginShellPath?: (shell: string) => string | undefined;
    readonly readLaunchctlPath?: typeof readPathFromLaunchctl;
    readonly isDirectory?: (path: string) => boolean;
  } = {},
): void {
  const overrideLoginShellPath = options.readLoginShellPath;
  const readLoginShellEnvironment = (shell: string): Partial<Record<string, string>> => {
    if (overrideLoginShellPath === undefined) {
      // mise's record of the PATH entries it added. It must travel with the
      // shell's PATH, or `mise x` can rebuild PATH behind a same-named wrapper
      // (`exec mise x claude -- claude`) that then re-runs itself forever.
      return readEnvironmentFromLoginShell(shell, ["PATH", "__MISE_DIFF", "JAVA_HOME"]);
    }
    const path = overrideLoginShellPath(shell);
    return path === undefined ? {} : { PATH: path };
  };
  const readLaunchctlPath = options.readLaunchctlPath ?? readPathFromLaunchctl;
  const isDirectory =
    options.isDirectory ??
    ((path: string) => {
      try {
        return NodeFS.statSync(path).isDirectory();
      } catch {
        return false;
      }
    });
  let shellEnvironment: Partial<Record<string, string>> = {};
  for (const shell of listLoginShellCandidates(platform, env.SHELL)) {
    try {
      shellEnvironment = readLoginShellEnvironment(shell);
    } catch (error) {
      logPathHydrationWarning(`Failed to read PATH from login shell ${shell}.`, error);
    }

    if (shellEnvironment.PATH) break;
  }

  const shellPath = shellEnvironment.PATH;
  const launchctlPath = platform === "darwin" && !shellPath ? readLaunchctlPath() : undefined;
  const knownCliPath = resolveKnownPosixCliDirs(env).filter(isDirectory).join(":");
  const mergedPath = mergePathEntries(
    shellPath ?? launchctlPath,
    [env.PATH, knownCliPath].filter(Boolean).join(":"),
    platform,
  );
  if (mergedPath) {
    env.PATH = mergedPath;
  }
  if (shellPath && shellEnvironment.__MISE_DIFF) {
    env.__MISE_DIFF = shellEnvironment.__MISE_DIFF;
  }
  // Android SDK tools are Java programs. A keg-only JDK (Homebrew's openjdk)
  // is only reachable through the JAVA_HOME the shell profile sets.
  if (!env.JAVA_HOME && shellEnvironment.JAVA_HOME) {
    env.JAVA_HOME = shellEnvironment.JAVA_HOME;
  }
}

export function hydratePosixHome(
  env: NodeJS.ProcessEnv,
  resolveHomeDir = () => NodeOS.userInfo().homedir,
): void {
  if ((env.HOME?.trim() ?? "").length > 0) return;

  const homeDir = resolveHomeDir();
  if (homeDir.length > 0) {
    env.HOME = homeDir;
  }
}

export const fixPath = Effect.fn("fixPath")(function* (options?: {
  readonly shellEnvironmentPrepared?: boolean | undefined;
}): Effect.fn.Return<void, never, FileSystem.FileSystem | Path.Path> {
  const platform = yield* HostProcess.Platform;
  const env = yield* HostProcess.Environment;

  if (platform === "win32") {
    // The desktop already ran both PowerShell probes into the env this child
    // extends. Repeating them here costs seconds of startup on Windows.
    if (options?.shellEnvironmentPrepared === true) return;
    const repairedEnvironment = yield* resolveWindowsEnvironment(env).pipe(
      Effect.catchDefect((defect) =>
        Effect.sync(() => {
          logPathHydrationWarning("Failed to hydrate PATH from the user environment.", defect);
          return {} as Partial<NodeJS.ProcessEnv>;
        }),
      ),
    );
    for (const [key, value] of Object.entries(repairedEnvironment)) {
      if (value === undefined) continue;
      if (key === "PATH") {
        setWindowsPath(env, value);
      } else {
        env[key] = value;
      }
    }
    return;
  }

  if (platform !== "darwin" && platform !== "linux") return;

  yield* Effect.sync(() => hydratePosixHome(env)).pipe(
    Effect.catchDefect((defect) =>
      Effect.sync(() => {
        logPathHydrationWarning("Failed to hydrate HOME from the user account.", defect);
      }),
    ),
  );
  if (options?.shellEnvironmentPrepared === true) return;
  yield* Effect.sync(() => hydratePosixPath(env, platform)).pipe(
    Effect.catchDefect((defect) =>
      Effect.sync(() => {
        logPathHydrationWarning("Failed to hydrate PATH from the user environment.", defect);
      }),
    ),
  );
});

export const expandHomePath = Effect.fn(function* (input: string) {
  const { join } = yield* Path.Path;
  const home = yield* HostProcess.HomeDirectory;
  if (input === "~") {
    return home;
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(home, input.slice(2));
  }
  return input;
});

export const resolveBaseDir = Effect.fn(function* (
  raw: string | undefined,
  defaultDirName = ".t3",
) {
  const { join, resolve } = yield* Path.Path;
  if (!raw || raw.trim().length === 0) {
    return join(yield* HostProcess.HomeDirectory, defaultDirName);
  }
  return resolve(yield* expandHomePath(raw.trim()));
});
