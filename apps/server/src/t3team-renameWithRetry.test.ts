// @effect-diagnostics nodeBuiltinImport:off - the real-filesystem case drives an actual child process.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";

import { renameDirectoryWithRetry } from "./t3team-renameWithRetry.ts";

const renameFailure = (code: string) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "FileSystem",
    method: "rename",
    pathOrDescriptor: "/clone",
    cause: Object.assign(new Error(code), { code }),
  });

const fileSystemFailing = (codes: ReadonlyArray<string>, calls: { count: number }) =>
  FileSystem.layerNoop({
    rename: () => {
      const code = codes[calls.count];
      calls.count += 1;
      return code === undefined ? Effect.void : Effect.fail(renameFailure(code));
    },
  });

it.effect("keeps renaming while Windows holds the freshly cloned tree", () =>
  Effect.gen(function* () {
    const calls = { count: 0 };
    yield* renameDirectoryWithRetry("/clone", "/final", { delayMs: 0 }).pipe(
      Effect.provide(fileSystemFailing(["EPERM", "EBUSY", "EACCES"], calls)),
    );
    assert.strictEqual(calls.count, 4);
  }),
);

it.effect("does not retry a failure that waiting cannot fix", () =>
  Effect.gen(function* () {
    const calls = { count: 0 };
    const exit = yield* renameDirectoryWithRetry("/clone", "/final", { delayMs: 0 }).pipe(
      Effect.provide(fileSystemFailing(["ENOENT", "EPERM"], calls)),
      Effect.exit,
    );
    assert.isTrue(Exit.isFailure(exit));
    assert.strictEqual(calls.count, 1);
  }),
);

it.effect("gives up after the attempt budget", () =>
  Effect.gen(function* () {
    const calls = { count: 0 };
    const exit = yield* renameDirectoryWithRetry("/clone", "/final", {
      delayMs: 0,
      maxAttempts: 3,
    }).pipe(
      Effect.provide(fileSystemFailing(["EPERM", "EPERM", "EPERM", "EPERM"], calls)),
      Effect.exit,
    );
    assert.isTrue(Exit.isFailure(exit));
    assert.strictEqual(calls.count, 3);
  }),
);

/** Windows refuses to rename a directory that is some process's working directory: the same
 * EBUSY/EPERM a scanner's open handle causes after a clone. POSIX renames it happily. */
const itOnWindows = NodePath.sep === "\\" ? it.live : it.live.skip;

itOnWindows(
  "a directory a process is working in is renamed once it lets go (real filesystem)",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-rename-retry-" });
      const from = `${root}/clone`;
      const to = `${root}/final`;
      yield* fs.makeDirectory(from);
      const child = yield* Effect.acquireRelease(
        Effect.sync(() =>
          NodeChildProcess.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
            cwd: from,
            stdio: "ignore",
          }),
        ),
        (spawned) => Effect.sync(() => spawned.kill()),
      );
      yield* Effect.sleep("500 millis");

      const single = yield* fs.rename(from, to).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(single), "the held directory must refuse a plain rename");

      yield* Effect.forkChild(
        Effect.sleep("1500 millis").pipe(Effect.andThen(Effect.sync(() => child.kill()))),
      );
      yield* renameDirectoryWithRetry(from, to, { delayMs: 250 });
      assert.isTrue(yield* fs.exists(to));
      assert.isFalse(yield* fs.exists(from));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
