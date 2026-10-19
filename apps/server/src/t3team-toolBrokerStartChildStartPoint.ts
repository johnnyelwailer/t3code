/**
 * Start point of a delegated child's worktree: the freshly fetched `origin/<baseRef>` tip, so a
 * child never branches from a local base branch that has fallen behind the remote. Mirrors the
 * `startFromOrigin` provisioning of thread launches (`ThreadLaunchService`); when origin cannot be
 * used the local ref is kept and the description says why.
 *
 * @module t3team-toolBrokerStartChildStartPoint
 */
import * as Effect from "effect/Effect";

import type { GitWorkflowService } from "./git/GitWorkflowService.ts";

export interface ChildStartPoint {
  /** What `git worktree add` starts from: a commit of the fetched remote branch, or the local ref. */
  readonly refName: string;
  /** Agent-facing statement of exactly what `refName` is. */
  readonly description: string;
}

type StartPointGit = Pick<
  GitWorkflowService["Service"],
  "remoteExists" | "fetchRemote" | "remoteBranchExists" | "resolveRemoteTrackingCommit"
>;

const ORIGIN = "origin";
const SHORT_SHA_LENGTH = 10;

const localStartPoint = (baseRef: string, reason: string): ChildStartPoint => ({
  refName: baseRef,
  description: `local ${baseRef}, not origin/${baseRef}: ${reason}`,
});

export const resolveChildStartPoint = (input: {
  readonly gitWorkflow: StartPointGit;
  readonly cwd: string;
  readonly baseRef: string;
}): Effect.Effect<ChildStartPoint> => {
  const { gitWorkflow, cwd, baseRef } = input;
  return Effect.gen(function* () {
    if (!(yield* gitWorkflow.remoteExists({ cwd, remoteName: ORIGIN }))) {
      return localStartPoint(baseRef, "the repository has no origin remote");
    }
    yield* gitWorkflow.fetchRemote({ cwd, remoteName: ORIGIN, refName: baseRef });
    if (!(yield* gitWorkflow.remoteBranchExists({ cwd, remoteName: ORIGIN, refName: baseRef }))) {
      return localStartPoint(baseRef, `origin has no branch ${baseRef}`);
    }
    const tip = yield* gitWorkflow.resolveRemoteTrackingCommit({
      cwd,
      refName: baseRef,
      fallbackRemoteName: ORIGIN,
    });
    return {
      refName: tip.commitSha,
      description: `${tip.remoteRefName} at ${tip.commitSha.slice(0, SHORT_SHA_LENGTH)}, fetched just now`,
    };
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(localStartPoint(baseRef, `fetching origin failed (${error.detail})`)),
    ),
  );
};
