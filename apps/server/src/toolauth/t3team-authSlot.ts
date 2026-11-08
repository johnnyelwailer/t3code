/**
 * A tool's sign-in status on a cloud session that carries its login in an auth slot
 * (nexplore.ghe.com/hive/nx-nexi/issues/656): the session workflow restores the tool's login file
 * into its config dir, saves it back with the snapshot, and marks the server with the tool's
 * marker (`T3CODE_CLAUDE_AUTH_SLOT=1`, `T3CODE_CODEX_AUTH_SLOT=1`). The workflow's repository
 * variable is the feature switch; the marker is a fact about the session, not a host flag, because
 * a release preset that turns every host flag on would otherwise apply it to desktops, whose
 * Claude login may live in the macOS Keychain.
 *
 * There the status is read from the login file alone and the tool's CLI is never run. Claude
 * rotates its refresh token on every refresh and retires the old one everywhere, and a short-lived
 * CLI can refresh and exit before it writes the rotated token back (anthropics/claude-code#102265).
 * Codex refreshes its token too. The slot holds the session's only copy of the login, so a probe
 * losing it would sign the user out of every later session too.
 *
 * Privacy rule (as `t3team-status.ts`): the file is read only to see whether it still holds a
 * credential. No value is logged, returned or compared.
 *
 * @module toolauth/authSlot
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type * as ProcessRunner from "../processRunner.ts";
import { CLAUDE, CODEX } from "./t3team-adapters.ts";
import { probeStatus, type ToolAuthStatusOptions } from "./t3team-status.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

type SlotOptions = Pick<ToolAuthStatusOptions, "env" | "homeDir">;

interface AuthSlot {
  readonly markerEnv: string;
  /** Where the CLI keeps its login: this env var, else `defaultDir` under the home directory. */
  readonly configDirEnv: string;
  readonly defaultDir: string;
  readonly loginFile: string;
  readonly holdsLogin: (fileText: string) => boolean;
}

function readField(record: unknown, key: string): unknown {
  if (record === null || typeof record !== "object") return undefined;
  return Object.entries(record).find(([name]) => name === key)?.[1];
}

const isNonEmptyString = (value: unknown): boolean => typeof value === "string" && value.length > 0;

function parsed(fileText: string): unknown {
  try {
    return JSON.parse(fileText);
  } catch {
    return undefined;
  }
}

/**
 * A login Claude retired is emptied from the file, so a refresh token still being present is the
 * only signal available without running the CLI. A retired token that Claude has not tried yet
 * still reads as signed in; its first turn fails and empties the file.
 */
export function holdsClaudeRefreshToken(fileText: string): boolean {
  return isNonEmptyString(readField(readField(parsed(fileText), "claudeAiOauth"), "refreshToken"));
}

/** A ChatGPT sign-in (`tokens.refresh_token`) or an API key Codex stored at `codex login`. */
export function holdsCodexLogin(fileText: string): boolean {
  const auth = parsed(fileText);
  return (
    isNonEmptyString(readField(readField(auth, "tokens"), "refresh_token")) ||
    isNonEmptyString(readField(auth, "OPENAI_API_KEY"))
  );
}

const AUTH_SLOTS: ReadonlyMap<string, AuthSlot> = new Map([
  [
    CLAUDE.tool,
    {
      markerEnv: "T3CODE_CLAUDE_AUTH_SLOT",
      configDirEnv: "CLAUDE_CONFIG_DIR",
      defaultDir: ".claude",
      loginFile: ".credentials.json",
      holdsLogin: holdsClaudeRefreshToken,
    },
  ],
  [
    CODEX.tool,
    {
      markerEnv: "T3CODE_CODEX_AUTH_SLOT",
      configDirEnv: "CODEX_HOME",
      defaultDir: ".codex",
      loginFile: "auth.json",
      holdsLogin: holdsCodexLogin,
    },
  ],
]);

function loginFilePath(path: Path.Path, slot: AuthSlot, options: SlotOptions): string {
  const configDir = options.env[slot.configDirEnv]?.trim() ?? "";
  const resolvedConfigDir =
    configDir.length > 0 ? path.resolve(configDir) : path.join(options.homeDir, slot.defaultDir);
  return path.join(resolvedConfigDir, slot.loginFile);
}

const readAuthSlotStatus = Effect.fn("toolauth.readAuthSlotStatus")(function* (
  tool: string,
  slot: AuthSlot,
  options: SlotOptions,
): Effect.fn.Return<AuthState, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fileText = yield* fileSystem
    .readFileString(loginFilePath(path, slot, options))
    .pipe(Effect.option);
  const signedIn = Option.isSome(fileText) && slot.holdsLogin(fileText.value);
  return { tool, phase: signedIn ? "connected" : "idle" };
});

/** `probeStatus`, except for a tool whose login this session carries in an auth slot. */
export const probeToolStatus = (
  adapter: ToolAuthAdapter,
  options: ToolAuthStatusOptions,
): Effect.Effect<
  AuthState,
  never,
  ProcessRunner.ProcessRunner | FileSystem.FileSystem | Path.Path
> => {
  const slot = AUTH_SLOTS.get(adapter.tool);
  return slot !== undefined && options.env[slot.markerEnv] === "1"
    ? readAuthSlotStatus(adapter.tool, slot, options)
    : probeStatus(adapter, options);
};
