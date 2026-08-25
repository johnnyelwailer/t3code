import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

const EMPTY_ASYNC_RESULT_ATOM = Atom.make(AsyncResult.initial<never, never>(false)).pipe(
  Atom.withLabel("web-environment-query:empty"),
);

export interface EnvironmentQueryView<A> {
  readonly data: A | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

export function formatEnvironmentQueryError(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The environment request failed.";
}

// Module-level selector: `useAtomValue` memoizes the derived atom on the
// selector's identity, so an inline arrow would rebuild the subscription on
// every render and defeat the point of subscribing narrowly.
const selectQueryData = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | null =>
  Option.getOrNull(AsyncResult.value(result));

/**
 * Subscribe to only the DATA of an environment query.
 *
 * `useEnvironmentQuery` re-renders its component on every emission of the
 * underlying atom — including `waiting` flips around a refresh — and builds a
 * fresh view object each time. In lists where many rows share one atom (e.g.
 * every sidebar thread row of a project subscribing to the same
 * `vcs.status({cwd})`), a single refresh re-rendered every row several times.
 * Subscribing through a mapped atom means the component only re-renders when
 * the resolved data itself changes.
 */
export function useEnvironmentQueryData<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): A | null {
  return useAtomValue(
    (atom ?? EMPTY_ASYNC_RESULT_ATOM) as Atom.Atom<AsyncResult.AsyncResult<A, E>>,
    selectQueryData,
  );
}

export function useEnvironmentQuery<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): EnvironmentQueryView<A> {
  const selectedAtom = atom ?? EMPTY_ASYNC_RESULT_ATOM;
  const result = useAtomValue(selectedAtom);
  const refresh = useAtomRefresh(selectedAtom);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: atom !== null && result.waiting,
    refresh,
  };
}
