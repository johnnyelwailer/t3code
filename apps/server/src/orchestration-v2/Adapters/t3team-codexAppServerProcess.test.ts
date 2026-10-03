import * as NodeChildProcess from "node:child_process";

import { assert, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/unstable/process";

import { makeCodexAppServerSpawnCommand } from "./CodexAdapterV2.ts";
import {
  CODEX_APP_SERVER_FORCE_KILL_AFTER,
  isProcessAlive,
  spawnCodexAppServer,
} from "./t3team-codexAppServerProcess.ts";

it.effect("spawns the app-server with SIGKILL escalation", () =>
  Effect.gen(function* () {
    const command = yield* makeCodexAppServerSpawnCommand({
      command: "codex",
      args: ["app-server"],
    });
    assert.equal(
      command._tag === "StandardCommand" ? command.options.forceKillAfter : undefined,
      CODEX_APP_SERVER_FORCE_KILL_AFTER,
    );
  }),
);

it.effect("kills an app-server that survives its scoped release", () =>
  Effect.gen(function* () {
    // Stands in for an app-server whose spawner release did not stop it.
    const survivor = NodeChildProcess.spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1e6)"],
      {
        stdio: "ignore",
      },
    );
    const exited = new Promise<void>((resolve) => survivor.once("exit", () => resolve()));
    const pid = survivor.pid ?? -1;
    const command = yield* makeCodexAppServerSpawnCommand({ command: "codex", args: [] });
    const scope = yield* Scope.make();
    yield* spawnCodexAppServer(
      () =>
        Effect.succeed(
          ChildProcessSpawner.makeHandle({ pid: ChildProcessSpawner.ProcessId(pid) } as never),
        ),
      command,
    ).pipe(Effect.provideService(Scope.Scope, scope));
    assert.isTrue(isProcessAlive(pid));

    yield* Scope.close(scope, Exit.void);
    yield* Effect.promise(() => exited).pipe(Effect.timeout(Duration.seconds(5)));
    assert.isFalse(isProcessAlive(pid));
  }),
);

it("reports a missing process as not alive", () => {
  assert.isFalse(isProcessAlive(2 ** 22 + 12_345));
});
