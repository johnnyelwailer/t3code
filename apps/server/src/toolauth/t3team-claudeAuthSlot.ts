/**
 * Claude's sign-in status on a cloud session that carries the login in an auth slot (flag
 * `CLOUD_CLAUDE_AUTH_SLOT`, nexplore.ghe.com/hive/nx-nexi/issues/656): the session workflow
 * restores `.credentials.json` into `CLAUDE_CONFIG_DIR` and saves it back with the snapshot.
 *
 * There the status is read from the credential file alone and `claude auth status` is never run.
 * Claude rotates the refresh token on every refresh and retires the old one everywhere, and a
 * short-lived CLI can refresh and exit before it writes the rotated token back
 * (anthropics/claude-code#102265). The slot holds the session's only copy of the login, so a probe
 * losing it would sign the user out of every later session too.
 *
 * Privacy rule (as `t3team-status.ts`): the file is read only to see whether it still holds a
 * refresh token. No value is logged, returned or compared.
 *
 * @module toolauth/claudeAuthSlot
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type * as ProcessRunner from "../processRunner.ts";
import { CLAUDE } from "./t3team-adapters.ts";
import { probeStatus, type ToolAuthStatusOptions } from "./t3team-status.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

function isClaudeAuthSlotEnabled(env: NodeJS.ProcessEnv): boolean {
  return readFeatureFlag("CLOUD_CLAUDE_AUTH_SLOT", (key) => env[key]);
}

/** The file Claude Code keeps its login in: `CLAUDE_CONFIG_DIR`, else `~/.claude` (`ClaudeHome.ts`). */
function claudeCredentialFilePath(
  path: Path.Path,
  options: Pick<ToolAuthStatusOptions, "env" | "homeDir">,
): string {
  const configDir = options.env.CLAUDE_CONFIG_DIR?.trim() ?? "";
  const resolvedConfigDir =
    configDir.length > 0 ? path.resolve(configDir) : path.join(options.homeDir, ".claude");
  return path.join(resolvedConfigDir, ".credentials.json");
}

function readField(record: unknown, key: string): unknown {
  if (record === null || typeof record !== "object") return undefined;
  return Object.entries(record).find(([name]) => name === key)?.[1];
}

/**
 * A login Claude retired is emptied from the file, so a refresh token still being present is the
 * only signal available without running the CLI. A retired token that Claude has not tried yet
 * still reads as signed in; its first turn fails and empties the file.
 */
export function holdsClaudeRefreshToken(fileText: string): boolean {
  try {
    const refreshToken = readField(
      readField(JSON.parse(fileText), "claudeAiOauth"),
      "refreshToken",
    );
    return typeof refreshToken === "string" && refreshToken.length > 0;
  } catch {
    return false;
  }
}

const readClaudeAuthSlotStatus = Effect.fn("toolauth.readClaudeAuthSlotStatus")(function* (
  options: Pick<ToolAuthStatusOptions, "env" | "homeDir">,
): Effect.fn.Return<AuthState, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fileText = yield* fileSystem
    .readFileString(claudeCredentialFilePath(path, options))
    .pipe(Effect.option);
  const signedIn = Option.isSome(fileText) && holdsClaudeRefreshToken(fileText.value);
  return { tool: CLAUDE.tool, phase: signedIn ? "connected" : "idle" };
});

/** `probeStatus`, except for Claude on an auth-slot session (see the module doc). */
export const probeToolStatus = (
  adapter: ToolAuthAdapter,
  options: ToolAuthStatusOptions,
): Effect.Effect<
  AuthState,
  never,
  ProcessRunner.ProcessRunner | FileSystem.FileSystem | Path.Path
> =>
  adapter.tool === CLAUDE.tool && isClaudeAuthSlotEnabled(options.env)
    ? readClaudeAuthSlotStatus(options)
    : probeStatus(adapter, options);
