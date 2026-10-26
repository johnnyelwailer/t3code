import type { ClaudeSettings, ProviderAuthMethod, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ProviderAuthFlow from "@t3tools/provider-core/server/providerAuthFlow";
import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { makeClaudeCli } from "./t3team-ClaudeAuthCli.ts";
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

export const makeClaudeAuth = Effect.fn("makeClaudeAuth")(function* (options: {
  readonly instanceId: ProviderInstanceId;
  readonly config: ClaudeSettings;
  readonly processEnv: NodeJS.ProcessEnv;
  readonly configDir: string;
  readonly onChanged: Effect.Effect<void>;
}) {
  const pty = yield* Effect.serviceOption(PtyAdapter.PtyAdapter);
  const cli = yield* makeClaudeCli(options);

  const methods = Option.isSome(pty)
    ? Effect.succeed(METHODS)
    : Effect.fail(
        cli.failure("methods", "Interactive sign-in is unavailable on this environment."),
      );

  const authenticate = Effect.fn("ClaudeAuth.authenticate")(function* (
    methodId: string,
    context: ProviderAuthFlow.ProviderAuthFlowContext,
  ) {
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

  const logout = cli.ensureConfigDir.pipe(
    Effect.andThen(cli.signOut),
    Effect.andThen(options.onChanged),
  );

  return yield* ProviderAuthFlow.make({
    instanceId: options.instanceId,
    credentialBinding: { owner: "provider", key: `claude:${options.configDir.toLowerCase()}` },
    methods,
    defaultMethodId: "claudeai",
    authenticate,
    logout,
    timeoutMs: SIGN_IN_TIMEOUT_MS,
  });
});
