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
 * being updated), and HEAD otherwise. Only the listed paths differ from that parent. A remote that
 * cannot be read is an error, never "no such branch": guessing would start a second history.
 *
 * Name, email and commit signing follow the user's git config. Commit hooks do not run: the
 * commit is assembled with plumbing, and the host's own checks see it when it is pushed.
 * `t3team-changeRequestBranchGuards.ts` refuses a branch that is busy elsewhere first.
 *
 * @module t3team-changeRequestCommit
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { makeAssertBranchFree } from "./t3team-changeRequestBranchGuards.ts";
import { ChangeRequestRemoteUnreadableError } from "./t3team-changeRequestPublishErrors.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

const OPERATION = "T3TeamChangeRequestCommit";

/** Resolves its services once; the returned function commits, or returns null for no change. */
export const makeCommitPathsOnBranch = Effect.gen(function* () {
  const git = yield* GitVcsDriver.GitVcsDriver;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const assertBranchFree = yield* makeAssertBranchFree;
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
    yield* assertBranchFree(input.root, input.branch);
    const local = yield* tryRun(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    let tip = local;
    if (local === null) {
      // A branch only the remote has (an earlier session's change request) is continued.
      const listed = yield* git.execute({
        operation: OPERATION,
        cwd: input.root,
        args: ["ls-remote", "--exit-code", "--heads", input.remoteName, ref],
        allowNonZeroExit: true,
      });
      if (listed.exitCode === 0) {
        yield* run([
          "fetch",
          "--quiet",
          "--no-tags",
          "--no-write-fetch-head",
          input.remoteName,
          `+${ref}:${ref}`,
        ]);
        tip = yield* run(["rev-parse", "--verify", `${ref}^{commit}`]);
      } else if (listed.exitCode !== 2) {
        return yield* new ChangeRequestRemoteUnreadableError({
          branch: input.branch,
          remoteName: input.remoteName,
          detail: listed.stderr.trim().split("\n")[0] || `git exited ${listed.exitCode}.`,
        });
      }
    }
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
      return tip === null ? null : { commit: tip, created: false };
    }

    const sign = (yield* tryRun(["config", "--type=bool", "commit.gpgsign"])) === "true";
    const commit = yield* run(
      ["commit-tree", tree, "-p", parent, ...(sign ? ["-S"] : []), "-F", "-"],
      { stdin: input.message },
    );
    yield* run(["update-ref", ref, commit, tip ?? ""]);
    if ((yield* tryRun(["symbolic-ref", "--quiet", "HEAD"])) === ref) {
      yield* run(["reset", "--quiet", commit, "--", ...input.paths]);
    }
    return { commit, created: true };
  });
});
