// @effect-diagnostics nodeBuiltinImport:off - the test stubs the main thread's child_process.
import * as NodeModule from "node:module";

import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as OffThreadChildProcessSpawner from "./t3team-offThreadChildProcessSpawner.ts";

const ECHO_SCRIPT = `
process.stderr.write("ready\\n");
process.stdin.on("data", (chunk) => process.stdout.write(String(chunk).toUpperCase()));
process.stdin.on("end", () => process.exit(7));
`;

const SLEEP_SCRIPT = "setInterval(() => {}, 1000);";

const mainThreadChildProcess: { spawn: (...args: ReadonlyArray<unknown>) => unknown } =
  NodeModule.createRequire(import.meta.url)("node:child_process");

/** Makes any spawn from the main thread throw, so only an off-thread spawn can succeed. */
const forbidMainThreadSpawn = Effect.acquireRelease(
  Effect.sync(() => {
    const original = mainThreadChildProcess.spawn;
    mainThreadChildProcess.spawn = () => {
      throw new Error("child_process.spawn ran on the main thread");
    };
    NodeModule.syncBuiltinESMExports();
    return original;
  }),
  (original) =>
    Effect.sync(() => {
      mainThreadChildProcess.spawn = original;
      NodeModule.syncBuiltinESMExports();
    }),
);

const decode = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
  Stream.mkString(Stream.decodeText(stream));

it.layer(OffThreadChildProcessSpawner.layer)("OffThreadChildProcessSpawner", (it) => {
  it.effect("launches the child without calling child_process.spawn on the main thread", () =>
    Effect.gen(function* () {
      yield* forbidMainThreadSpawn;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(process.execPath, ["-e", ECHO_SCRIPT], {
          stdin: { stream: "pipe", endOnDone: true },
        }),
      );
      assert.isAbove(handle.pid, 0);
      yield* Stream.run(Stream.encodeText(Stream.make("hello off thread")), handle.stdin);
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [decode(handle.stdout), decode(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );
      assert.equal(stdout, "HELLO OFF THREAD");
      assert.equal(stderr, "ready\n");
      assert.equal(exitCode, 7);
    }).pipe(Effect.scoped),
  );

  it.effect("kills a running child when asked and when its scope closes", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const killed = yield* spawner.spawn(
        ChildProcess.make(process.execPath, ["-e", SLEEP_SCRIPT]),
      );
      assert.isTrue(yield* killed.isRunning);
      yield* killed.kill();
      assert.isFalse(yield* killed.isRunning);

      const scoped = yield* Effect.scoped(
        spawner.spawn(ChildProcess.make(process.execPath, ["-e", SLEEP_SCRIPT])),
      );
      assert.isFalse(yield* scoped.isRunning);
    }).pipe(Effect.scoped),
  );

  it.effect("reports a missing executable as a spawn failure", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const error = yield* spawner
        .spawn(ChildProcess.make("t3-definitely-missing-executable", []))
        .pipe(Effect.flip);
      assert.equal(error._tag, "PlatformError");
    }).pipe(Effect.scoped),
  );
});
