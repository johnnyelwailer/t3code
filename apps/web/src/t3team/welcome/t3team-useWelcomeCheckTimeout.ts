import { useEffect, useState } from "react";

import { WELCOME_CHECK_TIMEOUT_MS } from "./t3team-welcomeCheck.logic";

/** True once `pending` has lasted `WELCOME_CHECK_TIMEOUT_MS`; `restart` begins a new wait. */
export function useWelcomeCheckTimeout(pending: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- timer gives up on a pending read of an outside service
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTimedOutAttempt(attempt), WELCOME_CHECK_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      setTimedOutAttempt(null);
    };
  }, [pending, attempt]);
  return { timedOut: timedOutAttempt === attempt, restart: () => setAttempt((n) => n + 1) };
}
