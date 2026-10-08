/**
 * Commit listed paths onto a branch without touching the checkout they are read from.
 *
 * The publisher runs in a checkout another agent may be working in, so it must not switch that
 * checkout's branch or rewrite its index. The commit is built on a temporary index seeded from
 * the branch's parent, the listed paths are added from the working tree, and the branch ref is
 * moved by compare-and-swap. Only a checkout that is already on the branch sees a change: the
 * listed paths' index entries follow the new commit, so they do not read as staged reversals.
 *
 * The parent is the branch's own tip when it exists, locally or on the remote (a change request
 * being updated), and HEAD otherwise. Only the listed paths differ from that parent.
 *
 * @module t3team-changeRequestCommit
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

const OPERATION = "T3TeamChangeRequestCommit";

/** Resolves its services once; the returned function commits, or returns null for no change. */
export const makeCommitPathsOnBranch = Effect.gen(function* () {
  const git = yield* GitVcsDriver.GitVcsDriver;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return Effect.fn("commitPathsOnBranch")(function* (input: {
    readonly root: string;
    readonly branch: string;
    readonly remoteName: string;
    readonly paths: ReadonlyArray<string>;
    readonly message: string;
  }) {
    const run = (
      args: ReadonlyArray<string>,
      extra: { env?: NodeJS.ProcessEnv; stdin?: string } = {},
    ) =>
      git
        .execute({ operation: OPERATION, cwd: input.root, args, ...extra })
        .pipe(Effect.map((result) => result.stdout.trim()));
    const tryRun = (args: ReadonlyArray<string>) =>
      git
        .execute({ operation: OPERATION, cwd: input.root, args, allowNonZeroExit: true })
        .pipe(Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)));

    const ref = `refs/heads/${input.branch}`;
    const local = yield* tryRun(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    // A branch only the remote has (an earlier session's change request) is continued, not replaced.
    const remote =
      local === null &&
      (yield* tryRun(["fetch", "--quiet", "--no-tags", input.remoteName, ref])) !== null
        ? yield* tryRun(["rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"])
        : null;
    const tip = local ?? remote;
    const parent = tip ?? (yield* run(["rev-parse", "--verify", "HEAD^{commit}"]));

    const tree = yield* Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* fs
          .makeTempDirectoryScoped({ prefix: "t3team-cr-index-" })
          .pipe(Effect.orDie);
        const env = { GIT_INDEX_FILE: path.join(directory, "index") };
        yield* run(["read-tree", parent], { env });
        yield* run(["--literal-pathspecs", "add", "-A", "--", ...input.paths], { env });
        return yield* run(["write-tree"], { env });
      }),
    );
    if (tree === (yield* run(["rev-parse", `${parent}^{tree}`]))) {
      if (tip === null) return null;
      if (local === null) yield* run(["update-ref", ref, tip, ""]);
      return { commit: tip, created: false };
    }

    const commit = yield* run(["commit-tree", tree, "-p", parent, "-F", "-"], {
      stdin: input.message,
    });
    yield* run(["update-ref", ref, commit, local ?? ""]);
    if ((yield* tryRun(["symbolic-ref", "--quiet", "HEAD"])) === ref) {
      yield* run(["reset", "--quiet", commit, "--", ...input.paths]);
    }
    return { commit, created: true };
  });
});
