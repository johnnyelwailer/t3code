/**
 * Builds what one injected process receives: environment variables naming private files (or, when
 * asked, holding values) and the shell that runs the agent's command line.
 */
import type { UserSecretProcessBinding, UserSecretRunInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Redacted from "effect/Redacted";
import type * as Scope from "effect/Scope";

const variableFor = (binding: UserSecretProcessBinding): string =>
  binding.variable ?? (binding.as === "env" ? binding.name : `${binding.name}_FILE`);

/** The first variable two bindings would both set, if any. */
export function duplicateVariable(
  bindings: ReadonlyArray<UserSecretProcessBinding>,
): string | undefined {
  const seen = new Set<string>();
  for (const binding of bindings) {
    const variable = variableFor(binding);
    if (seen.has(variable)) return variable;
    seen.add(variable);
  }
  return undefined;
}

/**
 * POSIX sh, or Windows PowerShell: Node quotes arguments the way CommandLineToArgvW reads them,
 * which PowerShell honours and `cmd /s /c` does not.
 */
export const shellInvocation = (
  command: UserSecretRunInput["command"],
  platform: NodeJS.Platform,
): { readonly command: string; readonly args: ReadonlyArray<string> } =>
  platform === "win32"
    ? { command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", command] }
    : { command: "/bin/sh", args: ["-c", command] };

/** Files live in a 0700 directory removed when `Scope` closes, each 0600. */
export const injectedEnvironment = Effect.fn("UserSecretProcessInjection.injectedEnvironment")(
  function* (
    bindings: ReadonlyArray<UserSecretProcessBinding>,
    values: ReadonlyMap<string, Redacted.Redacted<string>>,
  ): Effect.fn.Return<
    Record<string, string>,
    PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path | Scope.Scope
  > {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment: Record<string, string> = {};
    let directory: string | undefined;
    for (const [index, binding] of bindings.entries()) {
      const value = values.get(binding.name);
      if (value === undefined) continue;
      if (binding.as === "env") {
        environment[variableFor(binding)] = Redacted.value(value);
        continue;
      }
      directory ??= yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-user-secret-" });
      yield* fileSystem.chmod(directory, 0o700);
      const file = path.join(directory, `${index}-${binding.name}`);
      yield* fileSystem.writeFileString(file, Redacted.value(value), { mode: 0o600 });
      environment[variableFor(binding)] = file;
    }
    return environment;
  },
);
