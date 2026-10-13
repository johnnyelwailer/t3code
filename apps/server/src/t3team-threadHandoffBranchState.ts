/**
 * Branch state for the thread handoff eligibility check: is there work on this checkout the
 * other machine cannot see? The other machine checks the branch out from the remote, so
 * unpushed commits and uncommitted changes would silently stay behind.
 *
 * Every probe degrades to `null` ("could not tell") instead of failing the capture.
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

const git = (vcs: Vcs, cwd: string, args: ReadonlyArray<string>) =>
  vcs.run({ operation: OPERATION, command: "git", args, cwd, allowNonZeroExit: true }).pipe(
    Effect.map((output) => (output.exitCode === 0 ? output.stdout : null)),
    Effect.orElseSucceed(() => null),
  );

export const readHandoffBranchState = Effect.fn("t3team.threadHandoff.readBranchState")(function* (
  vcs: Vcs,
  cwd: string,
) {
  const upstreamOut = yield* git(vcs, cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const upstream = upstreamOut?.trim() || null;
  // No upstream: every commit no remote has is local-only work.
  const countOut = yield* git(
    vcs,
    cwd,
    upstream === null
      ? ["rev-list", "--count", "HEAD", "--not", "--remotes"]
      : ["rev-list", "--count", "@{upstream}..HEAD"],
  );
  const statusOut = yield* git(vcs, cwd, ["status", "--porcelain"]);
  return {
    upstream,
    unpushedCommits: countOut === null ? null : parseCommitCount(countOut),
    uncommittedChanges: statusOut === null ? null : statusOut.trim().length > 0,
  } satisfies T3TeamThreadHandoffBranchState;
});
