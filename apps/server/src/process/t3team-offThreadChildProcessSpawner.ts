// @effect-diagnostics nodeBuiltinImport:off - owns a worker thread that must outlive any single fiber.
/**
 * A `ChildProcessSpawner` whose `CreateProcess` runs on a worker thread instead of the server's
 * event loop (see `t3team-offThreadSpawnWorker` for why that call can block for seconds).
 *
 * Meant for long-lived sidecars that the server launches unconditionally, such as the resource
 * monitor. Supports standard commands with piped stdio; pipelines and additional fds are rejected.
 *
 * @module t3team-offThreadChildProcessSpawner
 */
import * as NodeWorkerThreads from "node:worker_threads";

import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";
import * as Queue from "effect/Queue";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process";

import { OFF_THREAD_SPAWN_WORKER_SOURCE } from "./t3team-offThreadSpawnWorker.ts";
import { decodeWorkerEvent, type WorkerEvent } from "./t3team-offThreadSpawnProtocol.ts";
import {
  endsStdinOnDone,
  failure,
  isPiped,
  unsupported,
  workerSpawnOptions,
} from "./t3team-offThreadSpawnOptions.ts";

type Output = Queue.Queue<Uint8Array, PlatformError.PlatformError | Cause.Done>;

const DEFAULT_FORCE_KILL_AFTER = Duration.seconds(2);

const make = Effect.gen(function* () {
  const sessions = new Map<number, (event: WorkerEvent) => void>();
  let nextId = 0;
  const worker = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const created = new NodeWorkerThreads.Worker(OFF_THREAD_SPAWN_WORKER_SOURCE, { eval: true });
      created.unref();
      created.on("message", (message: unknown) => {
        const event = decodeWorkerEvent(message);
        if (event !== undefined) sessions.get(event.id)?.(event);
      });
      return created;
    }),
    (created) => Effect.promise(() => created.terminate()),
  );

  const spawn: ChildProcessSpawner.ChildProcessSpawner["Service"]["spawn"] = (command) =>
    Effect.gen(function* () {
      if (command._tag !== "StandardCommand") {
        return yield* unsupported("piped commands are not supported off-thread");
      }
      const { options } = command;
      if (
        options.additionalFds !== undefined ||
        ![options.stdin, options.stdout, options.stderr].every(isPiped)
      ) {
        return yield* unsupported("only piped stdio is supported off-thread");
      }
      const id = nextId++;
      const spawned = Deferred.makeUnsafe<number, PlatformError.PlatformError>();
      const exited = Deferred.makeUnsafe<
        ChildProcessSpawner.ExitCode,
        PlatformError.PlatformError
      >();
      const stdout: Output = yield* Queue.unbounded<
        Uint8Array,
        PlatformError.PlatformError | Cause.Done
      >();
      const stderr: Output = yield* Queue.unbounded<
        Uint8Array,
        PlatformError.PlatformError | Cause.Done
      >();
      const fail = (error: PlatformError.PlatformError) => {
        Deferred.doneUnsafe(spawned, Effect.fail(error));
        Deferred.doneUnsafe(exited, Effect.fail(error));
        Queue.failCauseUnsafe(stdout, Cause.fail(error));
        Queue.failCauseUnsafe(stderr, Cause.fail(error));
      };
      sessions.set(id, (event) => {
        switch (event.type) {
          case "spawned":
            return Deferred.doneUnsafe(spawned, Effect.succeed(event.pid));
          case "stdout":
            return Queue.offerUnsafe(stdout, event.chunk);
          case "stderr":
            return Queue.offerUnsafe(stderr, event.chunk);
          case "stdoutEnd":
            return Queue.endUnsafe(stdout);
          case "stderrEnd":
            return Queue.endUnsafe(stderr);
          case "error":
            return fail(failure("spawn", event.message, event.code));
          case "exit":
            sessions.delete(id);
            return Deferred.doneUnsafe(
              exited,
              event.code === null
                ? Effect.fail(
                    failure("exitCode", `Process interrupted by signal '${event.signal}'`),
                  )
                : Effect.succeed(ChildProcessSpawner.ExitCode(event.code)),
            );
        }
      });
      const post = (message: object, transfer?: ReadonlyArray<ArrayBuffer>) =>
        worker.postMessage({ id, ...message }, transfer === undefined ? undefined : [...transfer]);

      const kill = (killOptions?: ChildProcess.KillOptions) =>
        Effect.gen(function* () {
          if (Deferred.isDoneUnsafe(exited)) return;
          post({ op: "kill", signal: killOptions?.killSignal ?? options.killSignal ?? "SIGTERM" });
          const forceAfter =
            killOptions?.forceKillAfter ?? options.forceKillAfter ?? DEFAULT_FORCE_KILL_AFTER;
          const done = yield* Deferred.await(exited).pipe(
            Effect.ignore,
            Effect.timeoutOption(forceAfter),
          );
          if (done._tag === "None") post({ op: "kill", signal: "SIGKILL" });
        });

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          post({
            op: "spawn",
            command: command.command,
            args: [...command.args],
            options: workerSpawnOptions(options),
          }),
        ),
        () => kill().pipe(Effect.ensuring(Effect.sync(() => sessions.delete(id)))),
      );
      const pid = yield* Deferred.await(spawned);

      const stdin = Sink.forEach((chunk: Uint8Array) =>
        Effect.sync(() => {
          const copy = new Uint8Array(chunk);
          post({ op: "stdin", chunk: copy }, [copy.buffer]);
        }),
      ).pipe(
        Sink.ensuring(
          Effect.sync(() => endsStdinOnDone(options.stdin) && post({ op: "stdinEnd" })),
        ),
      );
      const stdoutStream = Stream.fromQueue(stdout);
      const stderrStream = Stream.fromQueue(stderr);

      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(pid),
        exitCode: Deferred.await(exited),
        isRunning: Effect.sync(() => !Deferred.isDoneUnsafe(exited)),
        kill,
        stdin,
        stdout: stdoutStream,
        stderr: stderrStream,
        all: Stream.merge(stdoutStream, stderrStream),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      });
    });

  return ChildProcessSpawner.make(spawn);
});

export const layer = Layer.effect(ChildProcessSpawner.ChildProcessSpawner, make);
