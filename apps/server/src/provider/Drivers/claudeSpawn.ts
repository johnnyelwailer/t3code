// The Claude Agent SDK's `spawnClaudeCodeProcess` hook is a synchronous callback
// that must return a Node `ChildProcess`, so this driver spawns directly via
// `node:child_process` rather than Effect's `ChildProcess` (matches the same
// suppression on `@t3tools/shared/shell`, which owns the resolution logic).
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";

import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { resolveSpawnCommandSync } from "@t3tools/shared/shell";

type ClaudeCodeSpawn = (options: SpawnOptions) => SpawnedProcess;

/**
 * Builds a custom spawn function for the Claude Agent SDK's
 * `spawnClaudeCodeProcess` hook, pinned to the given host platform.
 *
 * By default the SDK spawns `pathToClaudeCodeExecutable` directly with
 * `shell: false`. On Windows the configured binary ("claude") is an npm shim
 * (`claude.cmd`), which Node refuses to launch without a shell — the spawn
 * fails with `ENOENT`, the SDK's `initializationResult()` rejects, and the
 * provider can neither verify authentication nor run a session.
 *
 * Routing the spawn through {@link resolveSpawnCommandSync} resolves the real
 * executable from `PATH`/`PATHEXT` and applies the Windows shell + argument
 * escaping rules the rest of the app already relies on (see `resolveSpawnCommand`).
 * On non-Windows platforms it is a behavior-preserving passthrough to a plain
 * `spawn`; callers therefore install it only on Windows and leave other
 * platforms on the SDK's default spawn.
 *
 * The platform is injected (resolved from `HostProcessPlatform`) rather than
 * read from `process.platform` so the behavior stays explicit and testable.
 */
export function makeClaudeCodeSpawn(platform: NodeJS.Platform): ClaudeCodeSpawn {
  return (options) => {
    const env = options.env as NodeJS.ProcessEnv;
    const resolved = resolveSpawnCommandSync(options.command, options.args, {
      platform,
      env,
    });

    const child = NodeChildProcess.spawn(resolved.command, [...resolved.args], {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      env,
      signal: options.signal,
      shell: resolved.shell,
      windowsHide: true,
      // Mirror the SDK's default transport: pipe stdin/stdout for the JSON-RPC
      // stream and discard stderr (no stderr handler is wired through the SDK).
      stdio: ["pipe", "pipe", "ignore"],
    });

    if (child.stdin === null || child.stdout === null) {
      child.kill("SIGKILL");
      throw new Error("Claude Code process spawned without stdin/stdout pipes.");
    }

    // A Node ChildProcess satisfies SpawnedProcess structurally once stdin/stdout
    // are confirmed non-null; the interfaces differ only in stream nullability and
    // the set of EventEmitter overloads.
    return child as unknown as SpawnedProcess;
  };
}

/**
 * Builds the partial Claude Agent SDK options that opt a query into the custom
 * spawn hook, keyed on the host platform.
 *
 * Only Windows gets the override, because that is the only platform where the
 * SDK's default `shell: false` spawn cannot launch the `claude.cmd` shim. And
 * even on Windows the override is narrow: {@link resolveSpawnCommandSync} spawns
 * a resolved `.exe` directly (same as the SDK) and only switches to a shell for
 * `.cmd`/`.bat` shims — so this is not a blanket "always reroute" change.
 *
 * Centralizing the decision here keeps the platform branch out of the provider
 * Layers (`ClaudeProvider`, `ClaudeAdapter`), which simply spread the result.
 */
export function claudeCodeSpawnOptions(
  platform: NodeJS.Platform,
): { readonly spawnClaudeCodeProcess?: ClaudeCodeSpawn } {
  if (platform !== "win32") {
    return {};
  }
  return { spawnClaudeCodeProcess: makeClaudeCodeSpawn(platform) };
}
