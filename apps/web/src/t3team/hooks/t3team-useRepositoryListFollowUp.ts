import { useEffect, useRef } from "react";

const FOLLOW_UP_MS = 6_000;
const MAX_FOLLOW_UPS = 5;

/**
 * While the server refreshes a stale stored repository list in the background, re-read it a few
 * times so the new list replaces the old one without the user pressing refresh. Bounded: a refresh
 * the rate limit holds back must not become a polling loop. Stops as soon as `refreshing` clears
 * or the component goes away.
 */
export function useRepositoryListFollowUp(input: {
  readonly refreshing: boolean;
  readonly reread: () => Promise<void> | void;
}) {
  const { refreshing, reread } = input;
  const rereadRef = useRef(reread);
  useEffect(() => {
    rereadRef.current = reread;
  }, [reread]);
  useEffect(() => {
    if (!refreshing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waitThenReread = (remaining: number) => {
      if (remaining === 0) return;
      timer = setTimeout(() => {
        void Promise.resolve(rereadRef.current()).then(() => {
          if (!cancelled) waitThenReread(remaining - 1);
        });
      }, FOLLOW_UP_MS);
    };
    waitThenReread(MAX_FOLLOW_UPS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshing]);
}
