// @effect-diagnostics nodeBuiltinImport:off - the mock git runner inspects the
// pathspec files the driver writes on disk.
// @effect-diagnostics globalDate:off - temp directory naming only.
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { ChildProcessSpawner } from "effect/unstable/process";
import { assert, describe, it } from "@effect/vitest";

import * as GitVcsDriver from "./GitVcsDriver.ts";
import * as VcsDriver from "./VcsDriver.ts";
import { isUnindexableHostPath } from "./GitVcsDriverCheckpointIndex.ts";
import * as VcsProcess from "./VcsProcess.ts";
import * as ServerConfig from "../config.ts";

describe("isUnindexableHostPath", () => {
  it("classifies Windows-reserved device names case-insensitively", () => {
    assert.strictEqual(isUnindexableHostPath("nul"), true);
    assert.strictEqual(isUnindexableHostPath("NUL"), true);
    assert.strictEqual(isUnindexableHostPath("src\\Nul"), true);
    assert.strictEqual(isUnindexableHostPath("com1"), true);
    assert.strictEqual(isUnindexableHostPath("lpt9"), true);
    assert.strictEqual(isUnindexableHostPath("con.txt"), false);
    assert.strictEqual(isUnindexableHostPath("nuls"), false);
    assert.strictEqual(isUnindexableHostPath("src/nul.ts"), false);
    assert.strictEqual(isUnindexableHostPath("README.md"), false);
  });
});

const ok = (stdout = "", stderr = ""): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr,
  stdoutTruncated: false,
  stderrTruncated: false,
});

const failed = (exitCode: number, stderr: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(exitCode),
  stdout: "",
  stderr,
  stdoutTruncated: false,
  stderrTruncated: false,
});

/** Contents of each pathspec file the mocked `git add` sees. */
const pathspecReads: string[] = [];

const DriverLayer = Layer.mergeAll(GitVcsDriver.vcsLayer, GitVcsDriver.layer).pipe(
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-git-ckpt-index-" })),
  Layer.provideMerge(
    Layer.succeed(VcsProcess.VcsProcess, {
      run: (input) =>
        Effect.sync(() => {
          // The service-level execute prepends `-C <cwd>`; strip it.
          const args = input.args.slice(input.args[0] === "-C" ? 2 : 0);
          if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
            return ok(".git\n");
          }
          if (args[0] === "rev-parse" && args[1] === "--verify") {
            return ok("head-oid\n");
          }
          if (
            args[0] === "add" &&
            args.includes("-A") &&
            args.includes("--") &&
            args.includes(".")
          ) {
            // The live incident: a reserved-name file kills the broad add.
            return failed(
              128,
              "fatal: short read while indexing nul\nfatal: unable to index 'nul'\n",
            );
          }
          if (args[0] === "ls-files" && args.includes("--others")) {
            return ok("nul\0src/a.ts\0");
          }
          if (args[0] === "ls-files") {
            return ok("src/b.ts\0");
          }
          if (args[0] === "add" && args.includes("--pathspec-from-file")) {
            const pathspecFile = args[args.indexOf("--pathspec-from-file") + 1];
            const contents = NodeFs.readFileSync(pathspecFile!, "utf8");
            pathspecReads.push(contents);
            // The unfiltered pathspec still fails; the filtered one succeeds.
            return contents.split("\0").includes("nul")
              ? failed(128, "fatal: unable to index 'nul'\n")
              : ok();
          }
          if (args[0] === "read-tree") {
            return ok();
          }
          if (args[0] === "write-tree") {
            return ok("tree-oid\n");
          }
          if (args[0] === "commit-tree") {
            return ok("commit-oid\n");
          }
          if (args[0] === "update-ref") {
            return ok();
          }
          return failed(128, `unexpected git args: ${args.join(" ")}\n`);
        }),
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

it.effect("captureCheckpoint skips an unindexable reserved-name file instead of failing", () => {
  const repoDir = NodePath.join(NodeOs.tmpdir(), `t3-ckpt-index-test-${Date.now()}`);

  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const driver = yield* VcsDriver.VcsDriver;

    yield* fileSystem.makeDirectory(path.join(repoDir, ".git"), { recursive: true });

    assert.isNotNull(driver.checkpoints);
    const checkpointRef = "refs/t3/checkpoints/test-1";
    yield* driver.checkpoints!.captureCheckpoint({
      cwd: repoDir,
      checkpointRef: checkpointRef as never,
    });

    // The broad add failed; two pathspec adds ran. The second (filtered)
    // pathspec must not contain the reserved-name file.
    assert.strictEqual(pathspecReads.length, 2);
    const firstPathspec = pathspecReads[0]!;
    const secondPathspec = pathspecReads[1]!;
    assert.ok(firstPathspec.split("\0").includes("nul"));
    assert.ok(!secondPathspec.split("\0").includes("nul"));
    assert.ok(secondPathspec.includes("src/a.ts"));
    assert.ok(secondPathspec.includes("src/b.ts"));
    // The temp pathspec file is cleaned up.
    const leftovers = NodeFs.readdirSync(path.join(repoDir, ".git")).filter((name) =>
      name.startsWith("t3-checkpoint-pathspec-"),
    );
    assert.strictEqual(leftovers.length, 0);
  }).pipe(
    Effect.provide(DriverLayer),
    Effect.ensuring(
      Effect.sync(() => {
        try {
          NodeFs.rmSync(repoDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }),
    ),
  );
});
