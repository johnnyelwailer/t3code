import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

const EMPTY_ASYNC_RESULT_ATOM = Atom.make(AsyncResult.initial<never, never>(false)).pipe(
  Atom.withLabel("web-environment-query:empty"),
);

export interface EnvironmentQueryView<A, E = unknown> {
  readonly data: A | null;
  readonly dataUpdatedAt: number;
  readonly error: string | null;
  readonly failure: E | null;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
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

// Treats a Failure as no data, even when it carries a stale `previousSuccess`
// value (AsyncResult's stale-while-revalidate default): a caller using this
// selector wants to know a refresh failed, not keep rendering the last good
// value as if nothing were wrong.
const selectQueryDataOrNullOnError = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | null =>
  result._tag === "Failure" ? null : Option.getOrNull(AsyncResult.value(result));

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

/** Like {@link useEnvironmentQueryData}, but a failed refresh reads as no data instead of stale data. */
export function useEnvironmentQueryDataOrNullOnError<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): A | null {
  return useAtomValue(
    (atom ?? EMPTY_ASYNC_RESULT_ATOM) as Atom.Atom<AsyncResult.AsyncResult<A, E>>,
    selectQueryDataOrNullOnError,
  );
}

export function useEnvironmentQuery<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): EnvironmentQueryView<A, E> {
  const selectedAtom = atom ?? EMPTY_ASYNC_RESULT_ATOM;
  const result = useAtomValue(selectedAtom);
  const refresh = useAtomRefresh(selectedAtom);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    dataUpdatedAt:
      result._tag === "Success"
        ? result.timestamp
        : result._tag === "Failure"
          ? (Option.getOrNull(result.previousSuccess)?.timestamp ?? 0)
          : 0,
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    failure:
      result._tag === "Failure" ? Option.getOrNull(Cause.findErrorOption(result.cause)) : null,
    isPending: atom !== null && result.waiting,
    isSuccess: result._tag === "Success",
    refresh,
  };
}
