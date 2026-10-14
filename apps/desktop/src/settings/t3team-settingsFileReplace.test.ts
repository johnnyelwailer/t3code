import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import {
  removeStaleSettingsTempFiles,
  replaceFileWithRetry,
  STALE_TEMP_FILE_AGE_MS,
} from "./t3team-settingsFileReplace.ts";

const renameFailure = (code: string) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "FileSystem",
    method: "rename",
    pathOrDescriptor: "/settings.json",
    cause: Object.assign(new Error(code), { code }),
  });

const fileSystemWith = (input: {
  readonly codes: ReadonlyArray<string>;
  readonly targetIsDirectory?: boolean;
}) => {
  const calls = { rename: 0, removed: [] as string[] };
  const layer = FileSystem.layerNoop({
    rename: () => {
      const code = input.codes[calls.rename];
      calls.rename += 1;
      return code === undefined ? Effect.void : Effect.fail(renameFailure(code));
    },
    remove: (path) =>
      Effect.sync(() => {
        calls.removed.push(path);
      }),
    stat: () =>
      Effect.succeed({
        type: input.targetIsDirectory === true ? "Directory" : "File",
      } as never),
  });
  return { calls, layer };
};

it.effect(
  "keeps renaming while the settings file is held, and keeps the temp file until then",
  () =>
    Effect.gen(function* () {
      const { calls, layer } = fileSystemWith({ codes: ["EPERM", "EBUSY", "EACCES"] });
      const fileSystem = yield* Effect.provide(FileSystem.FileSystem, layer);
      yield* replaceFileWithRetry(
        fileSystem,
        "/settings.json.1.tmp",
        "/settings.json",
        [0, 0, 0, 0],
      );
      assert.strictEqual(calls.rename, 4);
      assert.deepEqual(calls.removed, []);
    }),
);

it.effect("gives up at once on a failure waiting cannot fix, and removes its temp file", () =>
  Effect.gen(function* () {
    const { calls, layer } = fileSystemWith({ codes: ["ENOENT", "EPERM"] });
    const fileSystem = yield* Effect.provide(FileSystem.FileSystem, layer);
    const exit = yield* replaceFileWithRetry(
      fileSystem,
      "/settings.json.1.tmp",
      "/settings.json",
      [0, 0, 0],
    ).pipe(Effect.exit);
    assert.isTrue(Exit.isFailure(exit));
    assert.strictEqual(calls.rename, 1);
    assert.deepEqual(calls.removed, ["/settings.json.1.tmp"]);
  }),
);

it.effect("does not wait on a rename onto a directory, which Windows also calls EPERM", () =>
  Effect.gen(function* () {
    const { calls, layer } = fileSystemWith({ codes: ["EPERM", "EPERM"], targetIsDirectory: true });
    const fileSystem = yield* Effect.provide(FileSystem.FileSystem, layer);
    const exit = yield* replaceFileWithRetry(
      fileSystem,
      "/settings.json.1.tmp",
      "/settings.json",
      [0, 0, 0],
    ).pipe(Effect.exit);
    assert.isTrue(Exit.isFailure(exit));
    assert.strictEqual(calls.rename, 1);
  }),
);

it.live("removes the leftovers of failed writes that are old enough, and nothing else", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-settings-tmp-" });
    const hex = "0123456789abcdef0123456789abcdef";
    const stale = `client-settings.json.4242.${hex}.tmp`;
    const fresh = `client-settings.json.4242.${"f".repeat(32)}.tmp`;
    const live = "client-settings.json";
    const other = `desktop-settings.json.4242.${hex}.tmp`;
    for (const name of [stale, fresh, live, other]) {
      yield* fileSystem.writeFileString(path.join(directory, name), "{}");
    }
    const nowMs = yield* Clock.currentTimeMillis;
    const old = DateTime.toDate(DateTime.makeUnsafe(nowMs - STALE_TEMP_FILE_AGE_MS - 60_000));
    for (const name of [stale, other]) {
      yield* fileSystem.utimes(path.join(directory, name), old, old);
    }

    const removed = yield* removeStaleSettingsTempFiles(
      fileSystem,
      path,
      directory,
      "client-settings.json",
    );

    assert.strictEqual(removed, 1);
    const remaining = (yield* fileSystem.readDirectory(directory)).toSorted();
    assert.deepEqual(remaining, [fresh, live, other].toSorted());
  }).pipe(Effect.provide(NodeServices.layer)),
);
