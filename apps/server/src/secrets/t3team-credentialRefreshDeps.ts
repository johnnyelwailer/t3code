/** Wires `CredentialRefresh` to the `gh` binary through this server's process spawner. */
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import type { CredentialRefreshDeps } from "./t3team-CredentialRefresh.ts";

export const credentialRefreshDeps = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const environment = yield* HostProcess.Environment;
  return {
    environment,
    spawnGh: Effect.fn("CredentialRefresh.spawnGh")(function* (args: ReadonlyArray<string>) {
      const scope = yield* Scope.make("sequential");
      const kill = Scope.close(scope, Exit.void);
      const child = yield* spawner
        .spawn(
          ChildProcess.make("gh", args, {
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            shell: false,
            detached: false,
            env: { GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
            extendEnv: true,
          }),
        )
        .pipe(
          Effect.provideService(Scope.Scope, scope),
          Effect.tapError(() => kill),
          Effect.mapError((cause) => ({ message: String(cause) })),
        );
      return {
        lines: child.all.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.ignore({ log: false }),
        ),
        exited: child.exitCode.pipe(Effect.orElseSucceed(() => 1)),
        kill,
      };
    }),
  } satisfies CredentialRefreshDeps;
});
