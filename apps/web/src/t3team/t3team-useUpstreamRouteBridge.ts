import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useThreadShells } from "~/state/entities";
import { translateUpstreamPath } from "~/t3team/t3team-upstreamRouteBridge";

/**
 * Keeps upstream sidebar navigation inside the T3 Team shell.
 *
 * Upstream components call `router.navigate({ to: "/$environmentId/$threadId" })`
 * directly. Rather than patching those call sites — which would conflict on every
 * upstream sync — the shell translates the resulting location into the equivalent
 * Team route. Anything the bridge cannot map falls back to the dashboard, which is
 * the behaviour the shell had before upstream's sidebar arrived.
 */
export function useUpstreamRouteBridge(pathname: string, enabled: boolean): void {
  const navigate = useNavigate();
  const threadShells = useThreadShells();

  const resolveProjectIdForThread = useCallback(
    ({ environmentId, threadId }: { environmentId: string; threadId: string }) =>
      threadShells.find((shell) => shell.id === threadId && shell.environmentId === environmentId)
        ?.projectId ??
      // Deep links can arrive before the environment id is known locally; a
      // unique thread id is still enough to place the thread.
      threadShells.find((shell) => shell.id === threadId)?.projectId ??
      null,
    [threadShells],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const translation = translateUpstreamPath(pathname, { resolveProjectIdForThread });
    if (translation.kind === "ignore") {
      return;
    }
    if (translation.kind === "unhandled") {
      void navigate({ to: "/t3team" });
      return;
    }
    void navigate(translation.target);
  }, [enabled, navigate, pathname, resolveProjectIdForThread]);
}
