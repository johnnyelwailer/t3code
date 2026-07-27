import { useCallback, useEffect, useRef, useState } from "react";

import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";

/** How long a successful write's "field → value · Undo" confirmation stays up. */
export const WORK_ITEM_FIELD_UNDO_WINDOW_MS = 10_000;

export type WorkItemFieldChange<TValue> = {
  readonly from: TValue;
  readonly to: TValue;
};

export type WorkItemFieldMutationResult<TValue> = {
  readonly value: TValue;
  readonly pending: boolean;
  readonly error: T3TeamUserFacingError | null;
  readonly commit: (nextValue: TValue) => void;
  readonly reset: () => void;
  /** The most recent successful change, while its undo window is still open; otherwise `null`. */
  readonly lastChange: WorkItemFieldChange<TValue> | null;
  /** Re-commits `lastChange.from` through the same mutate path. No-op when there is nothing to undo. */
  readonly undo: () => void;
};

/**
 * Optimistic edit for a single work item field: apply the new value immediately, call the backend,
 * and roll back if it rejects. A successful write leaves a short-lived `lastChange` so the caller can
 * offer "Undo" — the safety net that makes committing on a deliberate action (not on blur) feel safe
 * rather than merely careful.
 *
 * Concurrent edits to the same field are resolved last-write-wins. Every `commit` (including the one
 * `undo` issues) stamps a sequence number; a response only takes effect if its request is still the
 * most recent one, so a slow request that resolves after a newer edit was made can neither clobber
 * that newer optimistic value nor report its own success or failure over it.
 *
 * `TValue` must not use `undefined` as a legitimate field value — `undefined` is the sentinel for
 * "no optimistic override in flight". Use `null` for an empty/cleared field instead (as the backend
 * mutations here already do).
 */
export function useWorkItemFieldMutation<TValue>({
  value,
  mutate,
  action,
  isEqual = Object.is,
}: {
  /** The field's committed value, as the caller currently knows it (e.g. read off `model`). */
  readonly value: TValue;
  readonly mutate: (nextValue: TValue) => Promise<void>;
  /** Passed to `toUserFacingError` so a failure names what it was trying to do. */
  readonly action: string;
  /** How to tell the optimistic value apart from a freshly reloaded `value`. Defaults to `Object.is`. */
  readonly isEqual?: (a: TValue, b: TValue) => boolean;
}): WorkItemFieldMutationResult<TValue> {
  const [pendingValue, setPendingValue] = useState<TValue | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);
  const [lastChange, setLastChange] = useState<WorkItemFieldChange<TValue> | null>(null);
  const sequenceRef = useRef(0);
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastChangeRef = useRef(lastChange);
  lastChangeRef.current = lastChange;
  // Mirrors what's currently displayed, so `commit`/`undo` can read "the value we're changing from"
  // without needing `pendingValue`/`value` in their own dependency arrays.
  const displayedValueRef = useRef(value);
  displayedValueRef.current = pendingValue !== undefined ? pendingValue : value;

  // Once the source of truth (the caller's `value`, typically refreshed via `onReload`) catches up
  // with what we optimistically applied, drop the local override. This is what lets a successful
  // commit resolve cleanly instead of pinning the optimistic value forever.
  useEffect(() => {
    setPendingValue((current) =>
      current !== undefined && isEqualRef.current(current, value) ? undefined : current,
    );
  }, [value]);

  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  const commit = useCallback(
    (nextValue: TValue) => {
      const requestId = ++sequenceRef.current;
      const previousValue = displayedValueRef.current;
      clearTimeout(undoTimerRef.current);
      setLastChange(null);
      setPendingValue(nextValue);
      setPending(true);
      setError(null);

      mutate(nextValue)
        .then(() => {
          if (sequenceRef.current !== requestId) return; // superseded by a newer edit
          setPending(false);
          setLastChange({ from: previousValue, to: nextValue });
          // Cleared by the next `commit` too (see above); this timer only ever fires when nothing
          // superseded it, so it can clear unconditionally.
          undoTimerRef.current = setTimeout(() => setLastChange(null), WORK_ITEM_FIELD_UNDO_WINDOW_MS);
        })
        .catch((cause: unknown) => {
          if (sequenceRef.current !== requestId) return; // a newer edit already won
          setPendingValue(undefined);
          setPending(false);
          setError(toUserFacingError(cause, { action }));
        });
    },
    [action, mutate],
  );

  const reset = useCallback(() => {
    sequenceRef.current += 1; // invalidate any in-flight request's callbacks
    clearTimeout(undoTimerRef.current);
    setPendingValue(undefined);
    setPending(false);
    setError(null);
    setLastChange(null);
  }, []);

  const undo = useCallback(() => {
    if (!lastChangeRef.current) return;
    commit(lastChangeRef.current.from);
  }, [commit]);

  return {
    value: pendingValue !== undefined ? pendingValue : value,
    pending,
    error,
    commit,
    reset,
    lastChange,
    undo,
  };
}
