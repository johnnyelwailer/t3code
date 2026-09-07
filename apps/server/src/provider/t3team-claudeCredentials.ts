/**
 * Provider usage-limit sampling — Claude OAuth credentials.
 *
 * The bearer token comes from the macOS login keychain item
 * `Claude Code-credentials` (`claudeAiOauth.accessToken`), falling back to
 * the provider home's `.credentials.json` (where the CLI stores them when no
 * keychain is available).
 *
 * @module t3team-claudeCredentials
 */
import * as NodeOS from "node:os";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import { ChildProcess } from "effect/unstable/process";

import { expandHomePath } from "../pathExpansion.ts";
import { spawnAndCollect } from "./providerSnapshot.ts";
import {
  PROVIDER_USAGE_CLAUDE_DRIVER,
  ProviderUsageSamplerError,
  isProviderUsageSamplerError,
} from "./t3team-providerUsageSampler.ts";

export const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";
export const CLAUDE_CREDENTIALS_FILE_NAME = ".credentials.json";

export interface ClaudeCredentials {
  readonly accessToken: string;
  readonly subscriptionType?: string;
  readonly rateLimitTier?: string;
}

const parseClaudeCredentialsJson = (raw: string, source: string): ClaudeCredentials => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderUsageSamplerError({
      provider: PROVIDER_USAGE_CLAUDE_DRIVER,
      reason: `Could not parse Claude credentials from ${source}.`,
    });
  }
  const oauth = (parsed as { claudeAiOauth?: unknown })?.claudeAiOauth as
    | {
        accessToken?: unknown;
        subscriptionType?: unknown;
        rateLimitTier?: unknown;
      }
    | undefined;
  if (typeof oauth?.accessToken !== "string" || oauth.accessToken.length === 0) {
    throw new ProviderUsageSamplerError({
      provider: PROVIDER_USAGE_CLAUDE_DRIVER,
      reason: "Claude OAuth access token not found (not logged in with a Claude subscription?).",
    });
  }
  return {
    accessToken: oauth.accessToken,
    ...(typeof oauth.subscriptionType === "string"
      ? { subscriptionType: oauth.subscriptionType }
      : {}),
    ...(typeof oauth.rateLimitTier === "string" ? { rateLimitTier: oauth.rateLimitTier } : {}),
  };
};

const parseClaudeCredentials = (
  raw: string,
  source: string,
): Effect.Effect<ClaudeCredentials, ProviderUsageSamplerError> =>
  Effect.try({
    try: () => parseClaudeCredentialsJson(raw, source),
    catch: (error: unknown) =>
      isProviderUsageSamplerError(error)
        ? error
        : new ProviderUsageSamplerError({
            provider: PROVIDER_USAGE_CLAUDE_DRIVER,
            reason: `Could not parse Claude credentials from ${source}.`,
          }),
  });

const readClaudeCredentialsFromKeychain = Effect.fn(
  "providerUsageSampler.readClaudeCredentialsFromKeychain",
)(function* () {
  const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
    Scope.close(scope, Exit.void),
  );
  const result = yield* spawnAndCollect(
    "security",
    ChildProcess.make("security", ["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE, "-w"]),
  ).pipe(Effect.provideService(Scope.Scope, scope));
  if (result.code !== 0 || result.stdout.trim().length === 0) return undefined;
  return yield* parseClaudeCredentials(result.stdout, "the macOS login keychain").pipe(
    Effect.orElseSucceed(() => undefined),
  );
});

/**
 * Reads the Claude OAuth credentials: macOS login keychain first, then the
 * provider home's `.credentials.json`.
 */
export const readClaudeOauthCredentials = Effect.fn(
  "providerUsageSampler.readClaudeOauthCredentials",
)(function* (homePath?: string) {
  if (NodeOS.platform() === "darwin") {
    const fromKeychain = yield* readClaudeCredentialsFromKeychain();
    if (fromKeychain !== undefined) return fromKeychain;
  }
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const configDir = homePath?.trim() ? expandHomePath(homePath.trim()) : NodeOS.homedir();
  const credentialsPath = path.join(configDir, CLAUDE_CREDENTIALS_FILE_NAME);
  const raw = yield* fileSystem.readFileString(credentialsPath).pipe(
    Effect.mapError(
      () =>
        new ProviderUsageSamplerError({
          provider: PROVIDER_USAGE_CLAUDE_DRIVER,
          reason: `Claude credentials not found at ${credentialsPath}.`,
        }),
    ),
  );
  return yield* parseClaudeCredentials(raw, credentialsPath);
});
