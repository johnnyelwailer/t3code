import { useCallback, useEffect, useRef, useState } from "react";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { BackendApi } from "~/t3team/backend/t3team-types";

const ACTIVE_POLL_MS = 2_000;
const ERROR_RETRY_MS = 10_000;

/**
 * Reads a cheap status endpoint for `key` and polls it only while `isActive` holds for the latest
 * value, and again after `refresh()` (call it after an action that starts background work).
 */
export function usePolledStatus<T>(input: {
  readonly key: string | undefined;
  readonly enabled: boolean;
  readonly initial: T;
  readonly read: (backend: BackendApi, key: string) => Promise<T>;
  readonly isActive: (value: T) => boolean;
}) {
  const backend = useBackend();
  const [value, setValue] = useState<T>(input.initial);
  const restartRef = useRef<() => void>(() => {});
  // Latest callbacks without restarting the poll chain on every render.
  const readRef = useRef(input.read);
  const isActiveRef = useRef(input.isActive);
  useEffect(() => {
    readRef.current = input.read;
    isActiveRef.current = input.isActive;
  });
  const { key, enabled } = input;

  useEffect(() => {
    if (!backend || !enabled || !key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only the latest poll chain may schedule the next poll (a restart supersedes one in flight).
    let chain = 0;
    const poll = async () => {
      const current = ++chain;
      try {
        const next = await readRef.current(backend, key);
        if (cancelled || current !== chain) return;
        setValue(next);
        if (isActiveRef.current(next)) timer = setTimeout(() => void poll(), ACTIVE_POLL_MS);
      } catch {
        if (!cancelled && current === chain) timer = setTimeout(() => void poll(), ERROR_RETRY_MS);
      }
    };
    restartRef.current = () => {
      if (timer) clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [backend, enabled, key]);

  const refresh = useCallback(() => restartRef.current(), []);
  return { value, refresh };
}
