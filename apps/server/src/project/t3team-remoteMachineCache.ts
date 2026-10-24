/** Process-local, bounded immutable scans; background callers can only consult fresh cache entries. */
import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Exit from "effect/Exit";
import * as Hash from "effect/Hash";
import * as Option from "effect/Option";
import { remoteHead } from "./t3team-remoteMachineHead.ts";
import {
  remoteTarget,
  scanRemoteAtCommit,
  type RemoteMachineInput,
  type RemoteMachineTarget,
} from "./t3team-remoteMachineScan.ts";

// cwd and the project's display/selection identity do not affect immutable repository contents.
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
      this.commit === other.commit
    );
  }
  [Hash.symbol](): number {
    return Hash.string(JSON.stringify([this.target.url, this.commit]));
  }
}

export const makeRemoteMachineCache = Effect.gen(function* () {
  const heads = yield* Cache.make({
    capacity: 256,
    timeToLive: "5 minutes",
    lookup: (key: RemoteKey) => remoteHead(key.target),
  });
  const scans = yield* Cache.makeWith(
    (key: RemoteKey) => scanRemoteAtCommit(key.target, key.commit),
    {
      capacity: 256,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.minutes(5)),
    },
  );
  return Effect.fn("projectMachine.cachedRemote")(function* (
    input: RemoteMachineInput,
    cachedOnly = false,
  ) {
    const target = yield* remoteTarget(input);
    const key = new RemoteKey(target);
    const commit = cachedOnly
      ? Option.getOrNull(yield* Cache.getOption(heads, key))
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
