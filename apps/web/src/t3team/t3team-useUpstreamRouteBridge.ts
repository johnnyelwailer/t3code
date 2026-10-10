import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import {
  buildUpstreamBridgeNavigation,
  translateUpstreamPath,
} from "~/t3team/t3team-upstreamRouteBridge";

/**
 * Keeps upstream sidebar navigation inside the T3 Team shell.
 *
 * Upstream components call `router.navigate({ to: "/$environmentId/$threadId" })`
 * directly. Rather than patching those call sites — which would conflict on every
 * upstream sync — the shell translates the resulting location into the equivalent
 * Team route. Anything the bridge cannot map falls back to the dashboard, which is
 * the behaviour the shell had before upstream's sidebar arrived.
 *
 * Translations always `replace` the upstream URL. A push would leave
 * `/$environmentId/$threadId` under the Team thread in history; Back would land
 * on that transient path and this effect would re-translate it onto the same
 * child — looking like a refresh that never leaves the subagent.
 */
export function useUpstreamRouteBridge(pathname: string, enabled: boolean): void {
  const navigate = useNavigate();
  const threadShells = useThreadShells();
  const primaryEnvironmentId = usePrimaryEnvironmentId();

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

    const translation = translateUpstreamPath(pathname, {
      resolveProjectIdForThread,
      primaryEnvironmentId,
    });
    if (translation.kind === "ignore") {
      return;
    }
    void navigate(buildUpstreamBridgeNavigation(translation));
  }, [enabled, navigate, pathname, primaryEnvironmentId, resolveProjectIdForThread]);
}
