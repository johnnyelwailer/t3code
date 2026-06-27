/* oxlint-disable unicorn/no-instanceof-builtins -- Existing merged lint debt; keep green while preserving behavior. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { resolveT3workRouteSearchTarget } from "~/t3work/t3work-routeState";

export function useT3workPersistedRouteState<
  TState,
  TPersistedState extends Partial<TState>,
  TSearch extends object,
>({
  storageKey,
  parseSearch,
  readPersistedState,
  writePersistedState,
  resolveState,
  buildRouteSearch,
  areStatesEqual,
  areRouteSearchEqual,
  stripRouteSearchParams,
}: {
  storageKey: string;
  parseSearch: (search: Record<string, unknown>) => TSearch;
  readPersistedState: (storageKey: string) => TPersistedState | null;
  writePersistedState: (storageKey: string, state: TState) => void;
  resolveState: (input: { persisted?: TPersistedState | null; search?: TSearch | null }) => TState;
  buildRouteSearch: (state: TState) => TSearch;
  areStatesEqual: (left: TState, right: TState) => boolean;
  areRouteSearchEqual: (left: TSearch, right: TSearch) => boolean;
  stripRouteSearchParams: <TParams extends Record<string, unknown>>(
    params: TParams,
  ) => Record<string, unknown>;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rawSearch = useRouterState({ select: (state) => state.location.search });
  const parseSearchRef = useRef(parseSearch);
  parseSearchRef.current = parseSearch;
  const readPersistedStateRef = useRef(readPersistedState);
  readPersistedStateRef.current = readPersistedState;
  const writePersistedStateRef = useRef(writePersistedState);
  writePersistedStateRef.current = writePersistedState;
  const resolveStateRef = useRef(resolveState);
  resolveStateRef.current = resolveState;
  const buildRouteSearchRef = useRef(buildRouteSearch);
  buildRouteSearchRef.current = buildRouteSearch;
  const areStatesEqualRef = useRef(areStatesEqual);
  areStatesEqualRef.current = areStatesEqual;
  const areRouteSearchEqualRef = useRef(areRouteSearchEqual);
  areRouteSearchEqualRef.current = areRouteSearchEqual;
  const stripRouteSearchParamsRef = useRef(stripRouteSearchParams);
  stripRouteSearchParamsRef.current = stripRouteSearchParams;
  const routeTarget = useMemo(() => resolveT3workRouteSearchTarget(pathname), [pathname]);
  const routeSearch = useMemo(
    () => parseSearchRef.current(rawSearch as Record<string, unknown>),
    [rawSearch],
  );
  const [persistedState, setPersistedState] = useState<TPersistedState | null>(() =>
    readPersistedStateRef.current(storageKey),
  );
  const pendingRouteSearchRef = useRef<TSearch | null>(null);

  const state = useMemo(
    () => resolveStateRef.current({ persisted: persistedState, search: routeSearch }),
    [persistedState, routeSearch],
  );

  const updateRouteSearch = useCallback(
    (nextSearch: TSearch) => {
      if (!routeTarget) {
        return false;
      }

      void navigate({
        ...routeTarget,
        search: (previous) => ({
          ...stripRouteSearchParamsRef.current(previous as Record<string, unknown>),
          ...nextSearch,
        }),
        replace: true,
      });

      return true;
    },
    [navigate, routeTarget],
  );

  const enqueueRouteSearchUpdate = useCallback(
    (nextSearch: TSearch) => {
      if (areRouteSearchEqualRef.current(routeSearch, nextSearch)) {
        pendingRouteSearchRef.current = null;
        return;
      }

      const pendingRouteSearch = pendingRouteSearchRef.current;
      if (pendingRouteSearch && areRouteSearchEqualRef.current(pendingRouteSearch, nextSearch)) {
        return;
      }

      if (updateRouteSearch(nextSearch)) {
        pendingRouteSearchRef.current = nextSearch;
      }
    },
    [routeSearch, updateRouteSearch],
  );

  useEffect(() => {
    setPersistedState(readPersistedStateRef.current(storageKey));
    pendingRouteSearchRef.current = null;
  }, [storageKey]);

  useEffect(() => {
    const resolvedPersistedState = resolveStateRef.current({ persisted: persistedState });
    if (areStatesEqualRef.current(resolvedPersistedState, state)) {
      return;
    }

    writePersistedStateRef.current(storageKey, state);
    setPersistedState(state as unknown as TPersistedState);
  }, [persistedState, state, storageKey]);

  useEffect(() => {
    const pendingRouteSearch = pendingRouteSearchRef.current;
    if (pendingRouteSearch && areRouteSearchEqualRef.current(routeSearch, pendingRouteSearch)) {
      pendingRouteSearchRef.current = null;
    }

    const nextSearch = buildRouteSearchRef.current(state);
    enqueueRouteSearchUpdate(nextSearch);
  }, [enqueueRouteSearchUpdate, routeSearch, state]);

  const setState = useCallback(
    (value: TState | ((current: TState) => TState)) => {
      const nextState =
        value instanceof Function ? (value as (current: TState) => TState)(state) : value;
      if (areStatesEqualRef.current(nextState, state)) {
        return;
      }

      writePersistedStateRef.current(storageKey, nextState);
      setPersistedState(nextState as unknown as TPersistedState);
      enqueueRouteSearchUpdate(buildRouteSearchRef.current(nextState));
    },
    [enqueueRouteSearchUpdate, state, storageKey],
  );

  return {
    state,
    setState,
  };
}
