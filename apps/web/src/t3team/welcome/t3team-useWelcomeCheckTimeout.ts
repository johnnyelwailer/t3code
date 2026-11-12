import { useEffect, useState } from "react";

import { WELCOME_CHECK_TIMEOUT_MS } from "./t3team-welcomeCheck.logic";

/** True once `pending` has lasted `WELCOME_CHECK_TIMEOUT_MS`; `restart` begins a new wait. */
export function useWelcomeCheckTimeout(pending: boolean) {
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- timer gives up on a pending read of an outside service
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTimedOut(attempt >= 0), WELCOME_CHECK_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      setTimedOut(false);
    };
  }, [pending, attempt]);
  return { timedOut, restart: () => setAttempt((n) => n + 1) };
}
