import {
  ProviderSetupError,
  type ClaudeSettings,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/process";

import { runClaudeCommand } from "../ClaudeProvider.ts";
import { resolveClaudeSdkExecutablePath } from "./ClaudeExecutable.ts";
import { makeClaudeEnvironment } from "./ClaudeHome.ts";

const STATUS_TIMEOUT = "15 seconds";

const decodeStatus = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ loggedIn: Schema.Boolean })),
);

/** Sign-in cannot replace credentials that the environment supplies itself. */
const EXTERNAL_CREDENTIAL_VARIABLES = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
] as const;

const usesExternalCredentials = (environment: NodeJS.ProcessEnv): boolean =>
  EXTERNAL_CREDENTIAL_VARIABLES.some((name) => (environment[name]?.trim() ?? "") !== "");

/**
 * The probe resolves a relative CLAUDE_CONFIG_DIR against the server state dir,
 * and this login would resolve it against the config dir, so they could
 * disagree about where the account lives.
 */
const usesRelativeConfigDir = (input: SignInInput): boolean => {
  const inherited = input.processEnv.CLAUDE_CONFIG_DIR?.trim() ?? "";
  return input.config.homePath.trim() === "" && inherited !== "" && !input.isAbsolute(inherited);
};

interface SignInInput {
  readonly config: Pick<ClaudeSettings, "homePath">;
  readonly processEnv: NodeJS.ProcessEnv;
  readonly isAbsolute: (path: string) => boolean;
}

export const claudeSignInUnavailableReason = (input: SignInInput): string | undefined =>
  usesExternalCredentials(input.processEnv)
    ? "This Claude instance uses an API key, token or custom endpoint, so there is no account to sign in to."
    : usesRelativeConfigDir(input)
      ? "Set an absolute CLAUDE_CONFIG_DIR path for this Claude instance to sign in."
      : undefined;

export const claudeSignInSetup = (input: SignInInput) =>
  ({
    canAuthenticate: claudeSignInUnavailableReason(input) === undefined,
    canInstall: false,
  }) as const;

export const makeClaudeCli = Effect.fn("makeClaudeCli")(function* (options: {
  readonly instanceId: ProviderInstanceId;
  readonly config: ClaudeSettings;
  readonly processEnv: NodeJS.ProcessEnv;
  readonly configDir: string;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const failure = (operation: string, detail: string, cause?: unknown) =>
    new ProviderSetupError({ instanceId: options.instanceId, operation, detail, cause });

  // The environment must match the one the probe and adapter build, or the
  // login lands in a different config directory than the one they read.
  const environment = yield* makeClaudeEnvironment(options.config, options.processEnv).pipe(
    Effect.provideService(Path.Path, path),
  );
  const run = (operation: string, args: ReadonlyArray<string>) =>
    runClaudeCommand(options.config, args, options.processEnv, options.configDir).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.mapError((cause) => failure(operation, "Could not run the Claude CLI.", cause)),
    );

  const ensureConfigDir = fileSystem
    .makeDirectory(options.configDir, { recursive: true })
    .pipe(
      Effect.mapError((cause) =>
        failure("start", "Could not prepare this instance's Claude config directory.", cause),
      ),
    );

  const verifySignedIn = run("verify", ["auth", "status", "--json"]).pipe(
    Effect.timeoutOption(STATUS_TIMEOUT),
    Effect.flatMap((result) =>
      Option.isSome(result) && Option.exists(decodeStatus(result.value.stdout), (s) => s.loggedIn)
        ? Effect.void
        : Effect.fail(failure("verify", "Claude did not report a signed-in account. Try again.")),
    ),
  );

  const signOut = run("logout", ["auth", "logout"]).pipe(
    Effect.flatMap((result) =>
      result.code === 0
        ? Effect.void
        : Effect.fail(failure("logout", "Claude could not sign out. Try again.")),
    ),
  );

  const loginCommand = (flag: string) =>
    resolveClaudeSdkExecutablePath(options.config.binaryPath, environment).pipe(
      Effect.map((shell) => ({ shell, args: ["auth", "login", flag], env: environment })),
    );

  return { failure, ensureConfigDir, verifySignedIn, signOut, loginCommand };
});
