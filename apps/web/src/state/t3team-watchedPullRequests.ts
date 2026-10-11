/**
 * The one selector every PR surface reads for the watched indicator (doc 07 §3.1): a derived
 * atom per environment over the thread shells and the fork thread facts, gated on the
 * `threadPullRequestWatch` capability. Stories and tests feed the same components through
 * `T3TeamWatchedPullRequestsFixture` instead of the atom.
 */
import { useAtomValue } from "@effect/atom-react";
import { EMPTY_T3TEAM_THREAD_FACTS } from "@t3tools/client-runtime/state/thread-facts";
import type { EnvironmentId } from "@t3tools/contracts";
import { threadPullRequestKeyOf } from "@t3tools/shared/threadPullRequests";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { createContext, useCallback, useContext } from "react";

import { environmentServerConfigsAtom } from "./server";
import { t3teamThreadFactsAtoms } from "./t3team-threadSideStreams";
import {
  collectWatchedPullRequests,
  EMPTY_WATCHED_PULL_REQUESTS,
  NO_WATCHERS,
  type WatchedPullRequestsByKey,
  type WatchedPullRequestsCache,
  type WatchedPullRequestWatcher,
} from "./t3team-watchedPullRequests.logic";
import { environmentThreadShells } from "./threads";

const ALL_THREADS_INPUT = {};

export const watchedPullRequestsByKeyAtom = Atom.family((environmentId: EnvironmentId) => {
  // Last derivation per environment: watcher objects and per-key arrays survive unchanged ticks.
  let cache: WatchedPullRequestsCache | undefined;
  return Atom.make((get): WatchedPullRequestsByKey => {
    const supported =
      get(environmentServerConfigsAtom).get(environmentId)?.environment.capabilities
        .threadPullRequestWatch === true;
    if (!supported) return EMPTY_WATCHED_PULL_REQUESTS;
    const shells = get(environmentThreadShells.threadShellsAtom);
    const facts = Option.getOrElse(
      AsyncResult.value(
        get(t3teamThreadFactsAtoms.facts({ environmentId, input: ALL_THREADS_INPUT })),
      ),
      () => EMPTY_T3TEAM_THREAD_FACTS,
    );
    cache = collectWatchedPullRequests(shells, facts, environmentId, cache);
    return cache.byKey;
  }).pipe(Atom.withLabel(`t3team-watched-pull-requests:${environmentId}`));
});

const EMPTY_BY_KEY_ATOM = Atom.make(EMPTY_WATCHED_PULL_REQUESTS).pipe(
  Atom.withLabel("t3team-watched-pull-requests:none"),
);

/** Story and test seam: the map the atom would produce, keyed by `threadPullRequestKeyOf`. */
export const T3TeamWatchedPullRequestsFixture = createContext<WatchedPullRequestsByKey | null>(
  null,
);

export type PullRequestIdentity = {
  readonly host?: string | null | undefined;
  readonly repository: string;
  readonly number: number;
};

/** Digest and My Work items omit the host for github.com (doc 07 §3.1). */
export function watchedPullRequestKey(identity: PullRequestIdentity): string {
  return threadPullRequestKeyOf({
    host: identity.host ?? "github.com",
    repository: identity.repository,
    number: identity.number,
  });
}

/** The threads watching one pull request, newest need first; empty when nobody watches it. */
export function useWatchedPullRequestWatchers(
  environmentId: EnvironmentId | null,
  identity: PullRequestIdentity,
): ReadonlyArray<WatchedPullRequestWatcher> {
  const key = watchedPullRequestKey(identity);
  const fixture = useContext(T3TeamWatchedPullRequestsFixture);
  const select = useCallback(
    (byKey: WatchedPullRequestsByKey) => byKey.get(key) ?? NO_WATCHERS,
    [key],
  );
  const live = useAtomValue(
    fixture !== null || environmentId === null
      ? EMPTY_BY_KEY_ATOM
      : watchedPullRequestsByKeyAtom(environmentId),
    select,
  );
  return fixture === null ? live : (fixture.get(key) ?? NO_WATCHERS);
}
