import { useEffect, useMemo, useState } from "react";

import type { Thread } from "~/types";

import { isExternalSessionActive, readExternalSession } from "./t3team-externalSessionState";

export function useExternalSessionReadOnly(thread: Thread | null) {
  const [clock, setClock] = useState(() => Date.now());
  const [activeClaudeSessionIds, setActiveClaudeSessionIds] = useState<ReadonlySet<string> | null>(
    null,
  );
  const session = useMemo(() => readExternalSession(thread), [thread]);
  const active = session
    ? session.provider === "claudeAgent" && activeClaudeSessionIds !== null
      ? activeClaudeSessionIds.has(session.nativeId)
      : isExternalSessionActive(session, clock)
    : false;

  useEffect(() => {
    if (session?.provider !== "claudeAgent") {
      setActiveClaudeSessionIds(null);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/local-provider-sessions/claude-active");
        const payload = (await response.json()) as { sessionIds?: unknown };
        if (!response.ok || !Array.isArray(payload.sessionIds) || cancelled) return;
        setActiveClaudeSessionIds(
          new Set(payload.sessionIds.filter((id): id is string => typeof id === "string")),
        );
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.nativeId, session?.provider]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  return { session, active };
}
