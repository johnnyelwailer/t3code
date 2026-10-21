/**
 * Branch state for the thread handoff eligibility check: is there work on this checkout the
 * other machine cannot see? The other machine starts from `origin/<branch>`, so commits that
 * ref lacks and uncommitted changes would silently stay behind.
 *
 * A probe that cannot answer reports `null` ("could not tell"); the eligibility check refuses
 * on it rather than letting unknown state move.
 * @module t3team-threadHandoffBranchState
 */
import type { T3TeamThreadHandoffBranchState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { VcsProcess } from "./vcs/VcsProcess.ts";

type Vcs = VcsProcess["Service"];

const OPERATION = "t3team.threadHandoff.branchState";

export const UNKNOWN_BRANCH_STATE: T3TeamThreadHandoffBranchState = {
  upstream: null,
  unpushedCommits: null,
  uncommittedChanges: null,
};

/** `git rev-list --count` output as a count; anything else is "could not tell". */
export function parseCommitCount(stdout: string): number | null {
  const trimmed = stdout.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Exit code and stdout, or null when git could not run at all. */
const git = (vcs: Vcs, cwd: string, args: ReadonlyArray<string>) =>
  vcs.run({ operation: OPERATION, command: "git", args, cwd, allowNonZeroExit: true }).pipe(
    Effect.map((output) => ({ exitCode: output.exitCode, stdout: output.stdout })),
    Effect.orElseSucceed(() => null),
  );

const count = (vcs: Vcs, cwd: string, args: ReadonlyArray<string>) =>
  git(vcs, cwd, ["rev-list", "--count", ...args]).pipe(
    Effect.map((out) => (out?.exitCode === 0 ? parseCommitCount(out.stdout) : null)),
  );

/**
 * `branch` is the thread's branch, the one the successor checks out from origin. `upstream` is
 * `origin/<branch>` when origin has it, null when it does not (then `unpushedCommits` counts the
 * commits no remote has). Without a branch only remote-less commits count.
 */
export const readHandoffBranchState = Effect.fn("t3team.threadHandoff.readBranchState")(function* (
  vcs: Vcs,
  cwd: string,
  branch: string | null,
) {
  // Never take index.lock under the live agent's own git commands.
  const status = yield* git(vcs, cwd, ["--no-optional-locks", "status", "--porcelain"]);
  const uncommittedChanges = status?.exitCode === 0 ? status.stdout.trim().length > 0 : null;
  const localOnly = ["HEAD", "--not", "--remotes"];
  if (branch === null) {
    return {
      upstream: null,
      unpushedCommits: yield* count(vcs, cwd, localOnly),
      uncommittedChanges,
    };
  }
  const remoteRef = `refs/remotes/origin/${branch}`;
  // --quiet: exit 1 means "no such ref"; any other failure means git could not tell.
  const probe = yield* git(vcs, cwd, ["rev-parse", "--verify", "--quiet", `${remoteRef}^{commit}`]);
  if (probe?.exitCode === 0) {
    const unpushedCommits = yield* count(vcs, cwd, [`${remoteRef}..HEAD`]);
    return { upstream: `origin/${branch}`, unpushedCommits, uncommittedChanges };
  }
  return {
    upstream: null,
    unpushedCommits: probe?.exitCode === 1 ? yield* count(vcs, cwd, localOnly) : null,
    uncommittedChanges,
  } satisfies T3TeamThreadHandoffBranchState;
});

/**
 * Whether the checkout has an `origin` remote, the one the other machine fetches the project
 * from. Null when git could not tell (a folder that is not a repository, an unreadable `.git`).
 * `git remote get-url` reads the repository's remotes only, so an `origin` set in the global or
 * system git config does not count.
 */
export const readHandoffHasOrigin = (vcs: Vcs, cwd: string) =>
  git(vcs, cwd, ["remote", "get-url", "origin"]).pipe(
    // Exit 2: no such remote; 128 (not a repository) or anything else: could not tell.
    Effect.map((out) =>
      out?.exitCode === 0 ? out.stdout.trim().length > 0 : out?.exitCode === 2 ? false : null,
    ),
  );
