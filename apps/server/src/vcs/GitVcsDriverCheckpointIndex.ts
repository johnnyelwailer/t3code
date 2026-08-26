/**
 * Builds the checkpoint index: `git add -A` over the whole worktree, with a
 * fallback for hosts where a few paths cannot be indexed at all.
 *
 * The live incident: a stray Windows-reserved device-name file (`nul`) made
 * `git add -A -- .` exit 128, and EVERY checkpoint capture for that project
 * failed with zero diagnostics. The fallback enumerates candidate paths,
 * adds them through a NUL-separated pathspec FILE (argv has a length limit),
 * and skips the unindexable paths instead of failing the whole capture.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeCrypto from "node:crypto";
import * as Path from "effect/Path";

import { VcsError, VcsProcessExitError } from "@t3tools/contracts";
import { redactCommandArgs } from "@t3tools/shared/git";
import { truncate } from "@t3tools/shared/String";

const CHECKPOINT_STDERR_CAP = 4_096;

/** Windows-reserved device names, case-insensitive, as a full path segment. */
const WINDOWS_RESERVED_DEVICE_NAMES = new Set<string>([
  "nul",
  "con",
  "prn",
  "aux",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export const isUnindexableHostPath = (repoPath: string): boolean => {
  const base = repoPath.split(/[\\/]/).pop() ?? "";
  return WINDOWS_RESERVED_DEVICE_NAMES.has(base.toLowerCase());
};

type ExecuteGit = (input: {
  readonly operation: string;
  readonly cwd: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly allowNonZeroExit?: boolean;
}) => Effect.Effect<
  { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string },
  VcsError
>;

const boundedStderr = (stderr: string, args: readonly string[]): string | undefined => {
  const trimmed = redactCommandArgs(stderr, args).trim();
  return trimmed.length > 0 ? truncate(trimmed, CHECKPOINT_STDERR_CAP) : undefined;
};

const fail = (
  operation: string,
  cwd: string,
  detail: string,
  stderr?: string,
  exitCode: number = 0,
): Effect.Effect<never, VcsProcessExitError> =>
  Effect.fail(
    new VcsProcessExitError({
      operation,
      command: "git add",
      cwd,
      exitCode,
      detail,
      ...(stderr !== undefined ? { stderr } : {}),
    }),
  );

const listPaths = (execute: ExecuteGit, operation: string, cwd: string, args: readonly string[]) =>
  execute({ operation, cwd, args, env: process.env, allowNonZeroExit: true }).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout.split("\0").filter((part) => part.length > 0))
        : fail(
            operation,
            cwd,
            "Could not enumerate candidate checkpoint paths.",
            boundedStderr(result.stderr, args),
            result.exitCode ?? 0,
          ),
    ),
  );

export const indexCheckpointPaths = (deps: {
  readonly operation: string;
  readonly cwd: string;
  readonly gitCommonDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly execute: ExecuteGit;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}): Effect.Effect<void, VcsError> =>
  Effect.gen(function* () {
    const { operation, cwd, gitCommonDir, env, execute, fileSystem, path } = deps;
    const run = (args: readonly string[]) =>
      execute({ operation, cwd, args, env, allowNonZeroExit: true });

    // Fast path: index everything.
    const broadAdd = yield* run(["add", "-A", "--", "."]);
    if (broadAdd.exitCode === 0) {
      return;
    }

    // Fallback: add an explicit NUL-separated pathspec file (argv has a
    // length limit; a pathspec file does not).
    const [tracked, untracked] = yield* Effect.all([
      listPaths(execute, operation, cwd, ["ls-files", "-z"]),
      listPaths(execute, operation, cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ]);
    const candidatePaths = [...untracked, ...tracked];
    if (candidatePaths.length === 0) {
      return yield* fail(
        operation,
        cwd,
        "git add -A failed and no candidate paths could be enumerated for the checkpoint index.",
        boundedStderr(broadAdd.stderr, ["add", "-A", "--", "."]),
        broadAdd.exitCode ?? 0,
      );
    }

    const pathspecPath = path.join(
      gitCommonDir,
      `t3-checkpoint-pathspec-${NodeCrypto.randomUUID()}`,
    );
    const cleanupPathspec = fileSystem.remove(pathspecPath, { force: true }).pipe(Effect.ignore);

    const addViaPathspec = (paths: readonly string[]) =>
      fileSystem.writeFile(pathspecPath, Buffer.from(paths.join("\0"), "utf8")).pipe(
        Effect.mapError(
          () =>
            new VcsProcessExitError({
              operation,
              command: "git add",
              cwd,
              exitCode: 0,
              detail: `Could not write the checkpoint pathspec file at ${pathspecPath}.`,
            }),
        ),
        Effect.flatMap(() =>
          // -A so deletions inside the pathspec are also applied to the
          // temp index (it was seeded from HEAD, so deletions exist there).
          run(["add", "-A", "--pathspec-from-file", pathspecPath, "--pathspec-file-nul"]),
        ),
      );

    const firstAdd = yield* addViaPathspec(candidatePaths);
    if (firstAdd.exitCode === 0) {
      return yield* cleanupPathspec;
    }

    // Second fallback: drop the paths the host cannot index at all
    // (Windows-reserved device names) and add the rest.
    const indexablePaths = candidatePaths.filter((repoPath) => !isUnindexableHostPath(repoPath));
    if (indexablePaths.length === 0) {
      return yield* fail(
        operation,
        cwd,
        "git add -A failed and every candidate path is unindexable on this host; nothing was added to the checkpoint index.",
        boundedStderr(broadAdd.stderr, ["add", "-A", "--", "."]),
        broadAdd.exitCode ?? 0,
      );
    }
    const secondAdd = yield* addViaPathspec(indexablePaths);
    if (secondAdd.exitCode !== 0) {
      yield* cleanupPathspec;
      return yield* fail(
        operation,
        cwd,
        `git add -A failed and the explicit pathspec fallback could not index ${candidatePaths.length} paths (${candidatePaths.length - indexablePaths.length} unindexable paths were skipped).`,
        boundedStderr(secondAdd.stderr, ["add", "-A"]),
        secondAdd.exitCode ?? 0,
      );
    }
    yield* Effect.logWarning("checkpoint.index.partial", {
      detail: `skipped ${candidatePaths.length - indexablePaths.length} unindexable path(s) in checkpoint index for ${cwd}`,
    });
    return yield* cleanupPathspec;
  });
