/**
 * Memory-pressure banner on a thread (flag `NEXI_FF_RESOURCE_PRESSURE`,
 * advertised as `ServerConfig.resourcePressure`; off = no query, no item).
 *
 *  - paused: derived from the thread's `resource-pressure.*` activity trail —
 *    "Paused · memory pressure", its turns resume automatically;
 *  - otherwise, while the server's latest sample is warn/critical: a notice.
 *
 * Both carry the one-click "Clean up resources…" action (agent session +
 * background jobs of THIS thread, after a confirm that lists the PIDs).
 */
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { deriveResourcePressurePause } from "../../t3team/t3team-threadResourceCleanup.logic";
import { useThreadResourceCleanup } from "../../t3team/t3team-useThreadResourceCleanup";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/** The banner re-reads the server's cached sample at most this often (never triggers a scan). */
const BANNER_REFRESH_MS = 30_000;

export function useResourcePressureBannerItem(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly activities: ReadonlyArray<{ readonly kind: string; readonly createdAt: string }>;
}): ComposerBannerStackItem | null {
  const { enabled, environmentId, threadId, activities } = input;
  const active = enabled && environmentId !== null && threadId !== null;
  const query = useEnvironmentQuery(
    active ? serverEnvironment.resourcePressure({ environmentId, input: {} }) : null,
  );
  const { refresh } = query;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, BANNER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);
  const { cleanUp, busy } = useThreadResourceCleanup(environmentId);
  const paused = useMemo(
    () => (active ? deriveResourcePressurePause(activities) : null),
    [active, activities],
  );
  const level = query.data?.snapshot?.level ?? "ok";
  if (!active || (paused === null && level === "ok")) return null;
  return {
    id: "resource-pressure",
    variant: paused !== null || level === "critical" ? "warning" : "info",
    priority: paused !== null ? "urgent" : "notice",
    icon: <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />,
    title:
      paused !== null
        ? "Paused · memory pressure — resumes automatically once it clears"
        : `Memory pressure ${level}`,
    actions: (
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void cleanUp(threadId)}>
        Clean up resources…
      </Button>
    ),
  };
}
