/** Bounded commit scans and last-known HEADs; standby may be stale but never fetches. */
import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Exit from "effect/Exit";
import * as Hash from "effect/Hash";
import * as Option from "effect/Option";
import type { VcsProcess } from "../vcs/VcsProcess.ts";
import type {
  BranchNotFound,
  RemoteUnavailable,
  RepositoryRefused,
} from "./t3team-machineDefinitionReader.ts";
import { remoteBranchHead, remoteHead } from "./t3team-remoteMachineHead.ts";
import {
  remoteTarget,
  scanRemoteAtCommit,
  type RemoteMachineInput,
  type RemoteMachineTarget,
} from "./t3team-remoteMachineScan.ts";

// Git and provider credentials may depend on cwd; only display/selection labels are reusable.
class RemoteKey implements Equal.Equal {
  readonly target: RemoteMachineTarget;
  readonly commit: string;
  constructor(target: RemoteMachineTarget, commit = "") {
    this.target = target;
    this.commit = commit;
  }
  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      other instanceof RemoteKey &&
      this.target.url === other.target.url &&
      this.target.cwd === other.target.cwd &&
      this.target.branch === other.target.branch &&
      this.target.kind === other.target.kind &&
      this.commit === other.commit
    );
  }
  [Hash.symbol](): number {
    return Hash.string(
      JSON.stringify([
        this.target.url,
        this.target.cwd,
        this.target.branch,
        this.target.kind,
        this.commit,
      ]),
    );
  }
}

const headOf = (
  key: RemoteKey,
): Effect.Effect<
  string | null,
  RemoteUnavailable | RepositoryRefused | BranchNotFound,
  VcsProcess
> =>
  key.target.branch === undefined
    ? remoteHead(key.target)
    : remoteBranchHead({ ...key.target, branch: key.target.branch });

export const makeRemoteMachineCache = Effect.gen(function* () {
  const lastHeads = yield* Cache.make({
    capacity: 256,
    timeToLive: Duration.infinity,
    lookup: (_key: RemoteKey) => Effect.succeed<string | null>(null),
  });
  const heads = yield* Cache.makeWith(
    (key: RemoteKey) => headOf(key).pipe(Effect.tap((commit) => Cache.set(lastHeads, key, commit))),
    {
      capacity: 256,
      // A chosen branch that is missing may be pushed a moment later, so a failed read of it is short-lived.
      timeToLive: (exit, key) =>
        Exit.isFailure(exit) && key.target.branch !== undefined
          ? Duration.seconds(10)
          : Duration.minutes(5),
    },
  );
  const scans = yield* Cache.makeWith(
    (key: RemoteKey) => scanRemoteAtCommit(key.target, key.commit),
    {
      capacity: 256,
      timeToLive: (exit) =>
        Exit.isSuccess(exit) && (exit.value.candidates.length > 0 || exit.value.rejected.length > 0)
          ? Duration.infinity
          : Duration.minutes(5),
    },
  );
  return Effect.fn("projectMachine.cachedRemote")(function* (
    input: RemoteMachineInput,
    cachedOnly = false,
  ) {
    const target = yield* remoteTarget(input);
    const key = new RemoteKey(target);
    // Only standby/plain fallback may reuse an expired HEAD. Interactive starts use heads.
    const commit = cachedOnly
      ? Option.getOrNull(yield* Cache.getOption(lastHeads, key))
      : yield* Cache.get(heads, key);
    if (commit === null) return null;
    const revision = new RemoteKey(target, commit);
    const scan = cachedOnly
      ? Option.getOrNull(yield* Cache.getOption(scans, revision))
      : yield* Cache.get(scans, revision);
    if (scan === null) return null;
    return {
      candidates: scan.candidates.map((machine) => ({ ...machine, repository: input.repository })),
      rejected: scan.rejected.map((candidate) => ({ ...candidate, repository: input.repository })),
      remote: { url: input.url, commit },
      notFoundRepository:
        scan.candidates.length === 0 && scan.rejected.length === 0 ? target.repository : undefined,
    };
  });
});
