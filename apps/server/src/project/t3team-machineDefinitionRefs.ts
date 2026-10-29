/**
 * One `git ls-remote` for what the search looks at in a repository: the default branch, every
 * branch tip, and the head commit of the pull requests it was told about. It runs through the
 * same sign-in as `remoteHead` (CLONE_ENV); the URL goes only into the git arguments, and no
 * failure here carries it.
 *
 * @module t3team-machineDefinitionRefs
 */
import { isRevisionSha } from "@t3tools/source-control-core/server/t3team-fileAtRevision";
import * as Effect from "effect/Effect";

import { CLONE_ENV } from "../sourceControl/SourceControlRepositoryService.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import { RemoteUnavailable } from "./t3team-machineDefinitionReader.ts";

export interface RemoteRefs {
  readonly defaultBranch: string | null;
  readonly defaultCommit: string | null;
  readonly branches: ReadonlyArray<{ readonly name: string; readonly commit: string }>;
  /** Pull request number to its head commit, by whichever ref the host keeps it under. */
  readonly pulls: ReadonlyMap<number, string>;
  readonly truncated: boolean;
}

/** Where hosts keep a pull request's head: GitHub-likes, GitLab, Bitbucket Server. */
const pullRefs = (number: number) => [
  `refs/pull/${number}/head`,
  `refs/merge-requests/${number}/head`,
  `refs/pull-requests/${number}/from`,
];
const PULL_REF =
  /^refs\/(?:pull\/(\d+)\/head|merge-requests\/(\d+)\/head|pull-requests\/(\d+)\/from)$/;

export const listRemoteRefs = Effect.fn("machineSearch.listRemoteRefs")(function* (input: {
  readonly url: string;
  readonly cwd: string;
  readonly pullNumbers: ReadonlyArray<number>;
}) {
  const vcs = yield* VcsProcess;
  const out = yield* vcs
    .run({
      operation: "machine.findDefinitionRefs",
      command: "git",
      args: [
        "ls-remote",
        "--symref",
        "--",
        input.url,
        "HEAD",
        "refs/heads/*",
        ...input.pullNumbers.flatMap(pullRefs),
      ],
      cwd: input.cwd,
      env: CLONE_ENV,
      allowNonZeroExit: true,
      timeoutMs: 20_000,
      maxOutputBytes: 256 * 1024,
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new RemoteUnavailable({
            reason:
              cause._tag === "VcsProcessTimeoutError"
                ? "Listing the repository's refs timed out."
                : "The remote repository could not be reached.",
          }),
      ),
    );
  if (out.exitCode !== 0)
    return yield* new RemoteUnavailable({
      reason: "The remote repository could not be reached or access was refused.",
    });

  let defaultBranch: string | null = null;
  let defaultCommit: string | null = null;
  const branches: Array<{ name: string; commit: string }> = [];
  const pulls = new Map<number, string>();
  for (const line of out.stdout.split(/\r?\n/)) {
    const symref = /^ref: refs\/heads\/(\S+)\s+HEAD$/.exec(line.trim());
    if (symref?.[1] !== undefined) {
      defaultBranch = symref[1];
      continue;
    }
    const [commit, ref] = line.trim().split(/\s+/);
    if (commit === undefined || ref === undefined || !isRevisionSha(commit)) continue;
    if (ref === "HEAD") defaultCommit = commit.toLowerCase();
    else if (ref.startsWith("refs/heads/"))
      branches.push({ name: ref.slice("refs/heads/".length), commit: commit.toLowerCase() });
    else {
      const number = Number(
        PULL_REF.exec(ref)
          ?.slice(1)
          .find((part) => part !== undefined),
      );
      if (Number.isInteger(number) && !pulls.has(number)) pulls.set(number, commit.toLowerCase());
    }
  }
  return {
    defaultBranch,
    defaultCommit,
    branches,
    pulls,
    truncated: out.stdoutTruncated || out.stdoutInvalidUtf8 === true,
  } satisfies RemoteRefs;
});
