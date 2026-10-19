import { RegistryContext, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useContext } from "react";

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

function queryUpdatedAt(result: AsyncResult.AsyncResult<unknown, unknown>): number {
  return result._tag === "Success"
    ? result.timestamp
    : result._tag === "Failure"
      ? (Option.getOrNull(result.previousSuccess)?.timestamp ?? 0)
      : 0;
}

// Module-level selectors: `useEnvironmentQuerySelector` memoizes the derived atom on the
// selector's identity, so an inline arrow would rebuild the subscription every render.
const selectQueryData = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | null =>
  Option.getOrNull(AsyncResult.value(result));

// Treats a Failure as no data, even when it carries a stale `previousSuccess`
// value (AsyncResult's stale-while-revalidate default): a caller using this
// selector wants to know a refresh failed, not keep rendering the last good
// value as if nothing were wrong.
const selectQueryDataOrNullOnError = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | null =>
  result._tag === "Failure" ? null : Option.getOrNull(AsyncResult.value(result));

/**
 * Subscribe to only the DATA of an environment query, so a refresh that resolves to the same
 * data (a `waiting` flip, a new timestamp) does not re-render lists of rows sharing one atom.
 */
export function useEnvironmentQueryData<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): A | null {
  return useEnvironmentQuerySelector(atom, selectQueryData);
}

/** Like {@link useEnvironmentQueryData}, but a failed refresh reads as no data instead of stale data. */
export function useEnvironmentQueryDataOrNullOnError<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): A | null {
  return useEnvironmentQuerySelector(atom, selectQueryDataOrNullOnError);
}

export function useEnvironmentQuery<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): EnvironmentQueryView<A, E> {
  const selectedAtom = atom ?? EMPTY_ASYNC_RESULT_ATOM;
  const result = useAtomValue(selectedAtom);
  const refresh = useAtomRefresh(selectedAtom);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    dataUpdatedAt: queryUpdatedAt(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    failure:
      result._tag === "Failure" ? Option.getOrNull(Cause.findErrorOption(result.cause)) : null,
    isPending: atom !== null && result.waiting,
    isSuccess: result._tag === "Success",
    refresh,
  };
}

/**
 * Reads one part of a query's result. Every refetch publishes a new result (a
 * new timestamp, `waiting` on and off), and this re-renders only when the
 * selected part changes. `select` must be defined outside the component: a new
 * function per render would rebuild the derived atom every render.
 */
export function useEnvironmentQuerySelector<A, E, B>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
  select: (result: AsyncResult.AsyncResult<A, E>) => B,
): B {
  return useAtomValue(atom ?? EMPTY_ASYNC_RESULT_ATOM, select);
}

type QueryResultAtom = Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>;
// Lives as long as both queries do, so a row keeps the same comparison atom across renders.
const queryIsNewerAtoms = new WeakMap<
  QueryResultAtom,
  WeakMap<QueryResultAtom, Atom.Atom<boolean>>
>();
function queryIsNewerAtom(query: QueryResultAtom, than: QueryResultAtom): Atom.Atom<boolean> {
  let byThan = queryIsNewerAtoms.get(query);
  if (byThan === undefined) {
    byThan = new WeakMap();
    queryIsNewerAtoms.set(query, byThan);
  }
  let atom = byThan.get(than);
  if (atom === undefined) {
    atom = Atom.make((get) => queryUpdatedAt(get(query)) >= queryUpdatedAt(get(than)));
    byThan.set(than, atom);
  }
  return atom;
}

/** Whether `query` last succeeded no earlier than `than`, without re-rendering on every refetch. */
export function useEnvironmentQueryIsNewer(
  query: QueryResultAtom | null,
  than: QueryResultAtom | null,
): boolean {
  return useAtomValue(
    queryIsNewerAtom(query ?? EMPTY_ASYNC_RESULT_ATOM, than ?? EMPTY_ASYNC_RESULT_ATOM),
  );
}

/**
 * The query's refresh, plus its pending state read when called rather than
 * subscribed to, for callers that only gate a refresh on it.
 */
export function useEnvironmentQueryRefresh<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): { readonly refresh: () => void; readonly isPending: () => boolean } {
  const registry = useContext(RegistryContext);
  const selectedAtom = atom ?? EMPTY_ASYNC_RESULT_ATOM;
  const refresh = useAtomRefresh(selectedAtom);
  return { refresh, isPending: () => atom !== null && registry.get(selectedAtom).waiting };
}
