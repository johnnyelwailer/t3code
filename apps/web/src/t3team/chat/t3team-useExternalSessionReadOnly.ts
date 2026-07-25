import { useEffect, useMemo, useState } from "react";

import type { Thread } from "~/types";

import { isExternalSessionActive, readExternalSession } from "./t3team-externalSessionState";

export function useExternalSessionReadOnly(thread: Thread | null) {
  const [clock, setClock] = useState(() => Date.now());
  const session = useMemo(() => readExternalSession(thread), [thread]);
  const active = session ? isExternalSessionActive(session, clock) : false;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  return { session, active };
}
