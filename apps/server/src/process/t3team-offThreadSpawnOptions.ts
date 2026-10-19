/**
 * How a command's options map onto the off-thread spawn worker, and the errors it reports.
 *
 * @module t3team-offThreadSpawnOptions
 */
import * as PlatformError from "effect/PlatformError";
import type { ChildProcess } from "effect/process";

export const failure = (method: string, message: string, code?: string) =>
  PlatformError.systemError({
    _tag: code === "ENOENT" ? "NotFound" : code === "EACCES" ? "PermissionDenied" : "Unknown",
    module: "OffThreadChildProcessSpawner",
    method,
    description: message,
  });

export const unsupported = (description: string) =>
  PlatformError.badArgument({
    module: "OffThreadChildProcessSpawner",
    method: "spawn",
    description,
  });

const resolveEnv = (options: ChildProcess.CommandOptions) =>
  options.extendEnv === false ? options.env : { ...process.env, ...options.env };

export const isPiped = (option: unknown) =>
  option === undefined ||
  option === "pipe" ||
  (typeof option === "object" && option !== null && "stream" in option && option.stream === "pipe");

export const endsStdinOnDone = (stdin: ChildProcess.CommandOptions["stdin"]) =>
  !(
    typeof stdin === "object" &&
    stdin !== null &&
    "endOnDone" in stdin &&
    stdin.endOnDone === false
  );

/** Options the worker passes to `child_process.spawn`; stdio is always piped. */
export const workerSpawnOptions = (options: ChildProcess.CommandOptions) => ({
  cwd: options.cwd,
  env: resolveEnv(options),
  shell: options.shell,
  detached: options.detached,
  windowsHide: options.windowsHide ?? true,
  stdio: "pipe",
});
