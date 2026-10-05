/**
 * The web app's one instance of the fork thread side streams (`t3team.subscribeThreadFacts`,
 * `t3team.subscribeThreadArtifacts`). Both are capability-gated in client-runtime: against a
 * server without the fork capability they settle on an empty map / list and never send the
 * fork RPC, so every reader here degrades to "no fork facts / rows".
 */
import {
  createT3TeamThreadArtifactsAtoms,
  EMPTY_T3TEAM_THREAD_ARTIFACTS,
  type T3TeamThreadArtifacts,
} from "@t3tools/client-runtime/state/thread-artifacts";
import {
  createT3TeamThreadFactsAtoms,
  EMPTY_T3TEAM_THREAD_FACTS,
  type T3TeamThreadFactsByThreadId,
} from "@t3tools/client-runtime/state/thread-facts";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, T3TeamThreadFacts, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQueryData } from "./query";

export const t3teamThreadFactsAtoms = createT3TeamThreadFactsAtoms(connectionAtomRuntime);
export const t3teamThreadArtifactsAtoms = createT3TeamThreadArtifactsAtoms(connectionAtomRuntime);

const ALL_THREADS_INPUT = {};

/**
 * Every thread's facts in the environment (sidebar rows, rosters, the project store). One
 * stream for all listed threads; a missing entry means "no fork facts", never "hide".
 */
export function useT3TeamThreadFactsMap(
  environmentId: EnvironmentId | null,
): T3TeamThreadFactsByThreadId {
  const atom = useMemo(
    () =>
      environmentId === null
        ? null
        : t3teamThreadFactsAtoms.facts({ environmentId, input: ALL_THREADS_INPUT }),
    [environmentId],
  );
  return useEnvironmentQueryData(atom) ?? EMPTY_T3TEAM_THREAD_FACTS;
}

const NO_FACTS_ATOM = Atom.make(
  AsyncResult.initial<T3TeamThreadFactsByThreadId, never>(false),
).pipe(Atom.withLabel("environment-data:t3team:thread-facts:none"));

/**
 * One listed thread's facts (a sidebar row), read from the shared all-threads stream through a
 * per-thread selector: the row re-renders only when ITS facts object changes, not on every
 * sibling's activity-label update.
 */
export function useT3TeamListedThreadFacts(
  environmentId: EnvironmentId | null,
  threadId: ThreadId,
): T3TeamThreadFacts | undefined {
  const atom = useMemo(
    () =>
      environmentId === null
        ? NO_FACTS_ATOM
        : t3teamThreadFactsAtoms.facts({ environmentId, input: ALL_THREADS_INPUT }),
    [environmentId],
  );
  const select = useCallback(
    (result: AsyncResult.AsyncResult<T3TeamThreadFactsByThreadId, unknown>) =>
      Option.getOrUndefined(AsyncResult.value(result))?.get(threadId),
    [threadId],
  );
  return useAtomValue(
    atom as Atom.Atom<AsyncResult.AsyncResult<T3TeamThreadFactsByThreadId, unknown>>,
    select,
  );
}

/**
 * One thread's facts (the open chat). Follows only that thread, so a busy sibling's activity
 * label never re-renders the chat view.
 */
export function useT3TeamThreadFacts(
  environmentId: EnvironmentId | null,
  threadId: ThreadId | null,
): T3TeamThreadFacts | undefined {
  const atom = useMemo(
    () =>
      environmentId === null || threadId === null
        ? null
        : t3teamThreadFactsAtoms.facts({ environmentId, input: { threadId } }),
    [environmentId, threadId],
  );
  const facts = useEnvironmentQueryData(atom);
  return threadId === null ? undefined : facts?.get(threadId);
}

/** One thread's fork artifacts in timeline order (`createdAt`, then `id`). */
export function useT3TeamThreadArtifacts(
  environmentId: EnvironmentId | null,
  threadId: ThreadId | null,
): T3TeamThreadArtifacts {
  const atom = useMemo(
    () =>
      environmentId === null || threadId === null
        ? null
        : t3teamThreadArtifactsAtoms.artifacts({ environmentId, input: { threadId } }),
    [environmentId, threadId],
  );
  return useEnvironmentQueryData(atom) ?? EMPTY_T3TEAM_THREAD_ARTIFACTS;
}
