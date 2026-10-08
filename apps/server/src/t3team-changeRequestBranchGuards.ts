/**
 * When the change-request branch must not be moved behind git's back.
 *
 * `t3team-changeRequestCommit.ts` moves the branch with `update-ref`, which skips the checks
 * `git branch -f` and `git checkout` make. Those checks are made here instead: a branch checked out
 * in another worktree would show the new commit there as staged reversals, and a merge, cherry-pick,
 * revert or rebase in progress on it would fold the commit into the user's operation or drop it.
 *
 * @module t3team-changeRequestBranchGuards
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ChangeRequestBranchBusyError } from "./t3team-changeRequestPublishErrors.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import { parseWorktreeBranchPaths } from "./vcs/GitVcsDriverCore.ts";

const OPERATION = "T3TeamChangeRequestBranchGuards";

const IN_PROGRESS = [
  ["MERGE_HEAD", "a merge"],
  ["CHERRY_PICK_HEAD", "a cherry-pick"],
  ["REVERT_HEAD", "a revert"],
] as const;

export const makeAssertBranchFree = Effect.gen(function* () {
  const git = yield* GitVcsDriver.GitVcsDriver;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return Effect.fn("assertBranchFree")(function* (root: string, branch: string) {
    const exec = (args: ReadonlyArray<string>) =>
      git.execute({ operation: OPERATION, cwd: root, args, allowNonZeroExit: true });
    const ref = `refs/heads/${branch}`;
    const busy = (detail: string) => new ChangeRequestBranchBusyError({ branch, detail });

    const worktrees = yield* exec(["worktree", "list", "--porcelain", "-z"]);
    const checkedOutAt = parseWorktreeBranchPaths(worktrees.stdout).get(branch);
    if (checkedOutAt !== undefined && path.resolve(checkedOutAt) !== path.resolve(root)) {
      return yield* busy(`it is checked out in the worktree at ${checkedOutAt}.`);
    }

    const head = yield* exec(["symbolic-ref", "--quiet", "HEAD"]);
    if (head.exitCode === 0 && head.stdout.trim() === ref) {
      for (const [marker, what] of IN_PROGRESS) {
        if ((yield* exec(["rev-parse", "--quiet", "--verify", marker])).exitCode === 0) {
          return yield* busy(`this checkout is on it with ${what} in progress.`);
        }
      }
    }
    // A rebase detaches HEAD, and writes the branch back when it finishes.
    for (const directory of ["rebase-merge", "rebase-apply"]) {
      const headName = (yield* exec([
        "rev-parse",
        "--git-path",
        `${directory}/head-name`,
      ])).stdout.trim();
      const file = path.resolve(root, headName);
      const rebasing = yield* fs.readFileString(file).pipe(
        Effect.map((text) => text.trim()),
        Effect.orElseSucceed(() => ""),
      );
      if (rebasing === ref) return yield* busy("this checkout is rebasing it.");
    }
  });
});
