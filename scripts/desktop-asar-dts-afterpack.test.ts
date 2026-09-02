// @effect-diagnostics nodeBuiltinImport:off - builds a synthetic asar on disk and stages a fake
// electron-builder appOutDir for the afterPack hook to operate on.
/**
 * Synthetic asar round-trip test for `desktop-asar-dts-afterpack.cjs`.
 *
 * Regression: the hook's re-streaming of an existing symlink entry passed
 * `symlink: entry.link` straight through to `@electron/asar`'s
 * `createPackageFromStreams`. `entry.link` (from `getRawHeader`) is ROOT-relative,
 * but `createPackageFromStreams` resolves `symlink` relative to the link entry's
 * OWN directory (`@electron/asar`'s `Filesystem#insertLink`). A symlink that lives
 * in a nested directory and points elsewhere in the package therefore resolved to
 * the wrong target after any repack — silently, since the hook only fails loudly
 * on missing `.d.ts` closures, not on a corrupt symlink.
 *
 * This builds a small input asar with `@electron/asar` itself (file, directory,
 * executable file, nested-dir-to-elsewhere symlink, unpacked entry), stages the
 * hook next to a config with an empty `.d.ts` closure (so the hook's only job is
 * the re-stream), runs it, then extracts the result and asserts: entry order is
 * preserved, executable bits survive, file bodies are byte-exact, and the symlink
 * resolves to its original target.
 */
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const repoScriptsPackageJson = NodePath.join(import.meta.dirname, "package.json");
const asar = NodeModule.createRequire(repoScriptsPackageJson)("@electron/asar") as {
  createPackageFromStreams(
    dest: string,
    streams: ReadonlyArray<Record<string, unknown>>,
  ): Promise<void>;
  getRawHeader(archivePath: string): {
    header: { files: Record<string, unknown> };
    headerSize: number;
  };
  listPackage(archivePath: string): ReadonlyArray<string>;
  extractAll(archivePath: string, dest: string): void;
};

const KEEP_BODY = "keep-body\n";
const TARGET_BODY = "target-content\n";
const EXEC_BODY = "#!/bin/sh\necho hi\n";
const UNPACKED_BODY = "unpacked-body\n";

const readableFrom = (content: string) => () => {
  const stream = new NodeStream.Readable();
  stream.push(content);
  stream.push(null);
  return stream;
};

/** Build the synthetic "electron-builder produced" input asar at `dest`. */
const buildInputAsar = async (dest: string): Promise<void> => {
  // `dir/sub/link.txt` -> `other/real.txt`: a nested-directory symlink whose
  // target lives elsewhere in the package. `createPackageFromStreams` resolves
  // `symlink` relative to the link's own directory, so this is dir-relative.
  const linkTarget = NodePath.relative(
    NodePath.join("dir", "sub"),
    NodePath.join("other", "real.txt"),
  );
  await asar.createPackageFromStreams(dest, [
    { path: "dir", type: "directory", unpacked: false },
    { path: "dir/sub", type: "directory", unpacked: false },
    {
      path: "dir/sub/keep.txt",
      type: "file",
      unpacked: false,
      stat: { size: Buffer.byteLength(KEEP_BODY), mode: 0o644 },
      streamGenerator: readableFrom(KEEP_BODY),
    },
    {
      path: "dir/sub/link.txt",
      type: "link",
      unpacked: false,
      symlink: linkTarget.split(NodePath.sep).join("/"),
      stat: { size: 0, mode: 0o644 },
    },
    { path: "other", type: "directory", unpacked: false },
    {
      path: "other/real.txt",
      type: "file",
      unpacked: false,
      stat: { size: Buffer.byteLength(TARGET_BODY), mode: 0o644 },
      streamGenerator: readableFrom(TARGET_BODY),
    },
    {
      path: "bin.sh",
      type: "file",
      unpacked: false,
      stat: { size: Buffer.byteLength(EXEC_BODY), mode: 0o755 },
      streamGenerator: readableFrom(EXEC_BODY),
    },
    { path: "big", type: "directory", unpacked: false },
    {
      path: "big/unpacked.bin",
      type: "file",
      unpacked: true,
      stat: { size: Buffer.byteLength(UNPACKED_BODY), mode: 0o644 },
      streamGenerator: readableFrom(UNPACKED_BODY),
    },
  ]);
};

/** Stage a copy of the real hook + an empty-closure config, run it, return the repacked asar path. */
const runAfterPackHook = Effect.fn("runAfterPackHook")(function* (inputAsar: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workDir = yield* fs.makeTempDirectoryScoped({ prefix: "desktop-asar-dts-afterpack-" });

  const hookDir = path.join(workDir, "hook");
  const appOutDir = path.join(workDir, "out");
  const resourcesDir = path.join(appOutDir, "resources");
  yield* fs.makeDirectory(hookDir, { recursive: true });
  yield* fs.makeDirectory(resourcesDir, { recursive: true });

  const hookSource = path.join(import.meta.dirname, "desktop-asar-dts-afterpack.cjs");
  const stagedHook = path.join(hookDir, "desktop-asar-dts-afterpack.cjs");
  yield* fs.copyFile(hookSource, stagedHook);
  yield* fs.copyFile(inputAsar, path.join(resourcesDir, "app.asar"));
  const inputUnpacked = `${inputAsar}.unpacked`;
  if (NodeFS.existsSync(inputUnpacked)) {
    yield* fs.copy(inputUnpacked, `${path.join(resourcesDir, "app.asar")}.unpacked`, {
      overwrite: true,
    });
  }

  // Empty closure: this test exercises the re-stream, not the .d.ts re-injection
  // (that path fails loudly on a missing staged directory, which would fail this
  // test for an unrelated reason if the closure lists were non-empty here).
  yield* fs.writeFileString(
    path.join(hookDir, "desktop-asar-dts-afterpack.json"),
    JSON.stringify({
      stageAppDir: workDir,
      repoScriptsPackageJson,
      dtsDirectories: [],
      dtsFiles: [],
    }),
  );

  const hook = NodeModule.createRequire(stagedHook)(stagedHook) as (context: {
    appOutDir: string;
    outDir: string;
    electronPlatformName: string;
  }) => Promise<void>;

  yield* Effect.tryPromise(() =>
    hook({ appOutDir, outDir: appOutDir, electronPlatformName: "linux" }),
  );

  return path.join(resourcesDir, "app.asar");
});

it.layer(NodeServices.layer)("desktop-asar-dts-afterpack", (it) => {
  it.effect(
    "re-streams a nested symlink with a dir-relative target, not the header's root-relative one",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const scratch = yield* fs.makeTempDirectoryScoped({ prefix: "desktop-asar-dts-input-" });
        const inputAsar = path.join(scratch, "input.asar");
        yield* Effect.promise(() => buildInputAsar(inputAsar));

        // Sanity: the header stores the symlink target root-relative, exactly the
        // shape the hook must NOT pass straight through.
        const inputHeader = asar.getRawHeader(inputAsar).header;
        const headerLink = (inputHeader.files["dir"] as { files: Record<string, unknown> }).files[
          "sub"
        ] as { files: Record<string, { link?: string }> };
        assert.equal(headerLink.files["link.txt"].link, "other/real.txt");

        const inputOrder = asar.listPackage(inputAsar);
        const outputAsar = yield* runAfterPackHook(inputAsar);
        const outputOrder = asar.listPackage(outputAsar);
        assert.deepStrictEqual(outputOrder, inputOrder);

        const extractDir = path.join(scratch, "extracted");
        asar.extractAll(outputAsar, extractDir);

        assert.equal(
          NodeFS.readFileSync(path.join(extractDir, "dir", "sub", "keep.txt"), "utf8"),
          KEEP_BODY,
        );
        assert.equal(
          NodeFS.readFileSync(path.join(extractDir, "other", "real.txt"), "utf8"),
          TARGET_BODY,
        );
        assert.equal(NodeFS.readFileSync(path.join(extractDir, "bin.sh"), "utf8"), EXEC_BODY);
        assert.equal(NodeFS.statSync(path.join(extractDir, "bin.sh")).mode & 0o777, 0o755);
        assert.equal(
          NodeFS.readFileSync(path.join(extractDir, "big", "unpacked.bin"), "utf8"),
          UNPACKED_BODY,
        );

        // The regression: read the symlink THROUGH the real filesystem link. A
        // wrong (double-resolved) target either throws ENOENT or reads the wrong
        // file; a correct re-pack reads the same body as the real file above.
        const linkPath = path.join(extractDir, "dir", "sub", "link.txt");
        assert.isTrue(NodeFS.lstatSync(linkPath).isSymbolicLink());
        assert.equal(
          NodeFS.realpathSync(linkPath),
          NodeFS.realpathSync(path.join(extractDir, "other", "real.txt")),
        );
        assert.equal(NodeFS.readFileSync(linkPath, "utf8"), TARGET_BODY);
      }),
  );
});
