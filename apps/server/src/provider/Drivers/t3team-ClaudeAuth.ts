import type { ClaudeSettings, ProviderAuthMethod, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ProviderAuthFlow from "@t3tools/provider-core/server/providerAuthFlow";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { claudeSignInUnavailableReason, makeClaudeCli } from "./t3team-ClaudeAuthCli.ts";
import { CLAUDE_LOGIN_TERMINAL_SIZE, runClaudeLoginTerminal } from "./t3team-ClaudeAuthLogin.ts";

export { claudeSignInSetup } from "./t3team-ClaudeAuthCli.ts";

/** Manual paste of the OAuth code can take a while, so this outlasts the 5 minute default. */
const SIGN_IN_TIMEOUT_MS = 600_000;

const LOGIN_METHODS = [
  { id: "claudeai", name: "Claude subscription", flag: "--claudeai" },
  { id: "console", name: "Anthropic Console (API billing)", flag: "--console" },
  { id: "sso", name: "SSO", flag: "--sso" },
] as const;

const METHODS: ReadonlyArray<ProviderAuthMethod> = LOGIN_METHODS.map(({ id, name }) => ({
  id,
  name,
  description: null,
  type: "terminal",
}));

/** Only Windows and macOS volumes are case-insensitive by default. */
const bindingPath = (configDir: string, platform: NodeJS.Platform): string =>
  platform === "win32" || platform === "darwin" ? configDir.toLowerCase() : configDir;

export const makeClaudeAuth = Effect.fn("makeClaudeAuth")(function* (options: {
  readonly instanceId: ProviderInstanceId;
  readonly config: ClaudeSettings;
  readonly processEnv: NodeJS.ProcessEnv;
  readonly configDir: string;
  readonly onChanged: Effect.Effect<void>;
}) {
  const pty = yield* Effect.serviceOption(PtyAdapter.PtyAdapter);
  const platform = yield* HostProcess.Platform;
  const cli = yield* makeClaudeCli(options);
  const path = yield* Path.Path;
  const unavailable = claudeSignInUnavailableReason({
    config: options.config,
    processEnv: options.processEnv,
    isAbsolute: (candidate) => path.isAbsolute(candidate),
  });

  const methods = Option.isSome(pty)
    ? Effect.succeed(METHODS)
    : Effect.fail(
        cli.failure("methods", "Interactive sign-in is unavailable on this environment."),
      );

  const authenticate = Effect.fn("ClaudeAuth.authenticate")(function* (
    methodId: string,
    context: ProviderAuthFlow.ProviderAuthFlowContext,
  ) {
    if (unavailable !== undefined) return yield* cli.failure("start", unavailable);
    const method = LOGIN_METHODS.find((candidate) => candidate.id === methodId);
    if (!method || Option.isNone(pty))
      return yield* cli.failure("start", "This sign-in method is not available.");
    yield* cli.ensureConfigDir;
    const login = yield* cli.loginCommand(method.flag);
    yield* runClaudeLoginTerminal(
      {
        pty: pty.value,
        failure: cli.failure,
        spawn: { ...login, cwd: options.configDir, ...CLAUDE_LOGIN_TERMINAL_SIZE },
      },
      context,
    ).pipe(Effect.scoped);
    yield* context.verifying;
    yield* cli.verifySignedIn;
    yield* options.onChanged;
  });

  const logout = (
    unavailable === undefined ? Effect.void : Effect.fail(cli.failure("logout", unavailable))
  ).pipe(
    Effect.andThen(cli.ensureConfigDir),
    Effect.andThen(cli.signOut),
    Effect.andThen(options.onChanged),
  );

  return yield* ProviderAuthFlow.make({
    instanceId: options.instanceId,
    credentialBinding: {
      owner: "provider",
      key: `claude:${bindingPath(options.configDir, platform)}`,
    },
    methods,
    defaultMethodId: "claudeai",
    authenticate,
    logout,
    timeoutMs: SIGN_IN_TIMEOUT_MS,
  });
});
