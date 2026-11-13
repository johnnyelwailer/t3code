import { useRef, useState } from "react";

/**
 * A ref that is always the latest value, assigned during render (React's recommended
 * "latest ref" pattern). Use this so an effect can read a callback without listing it
 * in its dependency array — listing an unstable callback retriggers the effect on every
 * render and can freeze the window.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * A stable callback that always sees the latest closure. Do not put the result in an
 * effect's dependency list; it is not a reactive input. This is the useEvent pattern
 * (React's `useEffectEvent` is the same idea; this wrapper keeps a stable identity).
 */
export function useLatestCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const latest = useLatest(fn);
  const [stable] = useState(
    () => ((...args: never[]) => latest.current(...args)) as T,
  );
  return stable;
}
