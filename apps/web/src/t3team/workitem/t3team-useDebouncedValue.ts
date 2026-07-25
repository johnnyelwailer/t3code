import { useEffect, useState } from "react";

/**
 * Debounces a fast-changing value.
 *
 * Used for the assignee search box: searching Jira on every keystroke would spam the backend, and
 * the network round trip means the newest keystroke usually wins the race anyway. `useDeferredValue`
 * doesn't fit here because its delay depends on render priority rather than wall-clock time, and
 * this needs a fixed, predictable delay before it fires a request.
 */
export function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
