/**
 * Memory-pressure banner on a thread (flag `NEXI_FF_RESOURCE_PRESSURE`,
 * advertised as `ServerConfig.resourcePressure`; off = no query, no item).
 *
 *  - paused: the thread fact `resourcePressurePaused` —
 *    "Paused · memory pressure", its turns resume automatically;
 *  - otherwise, while the server's latest sample is warn/critical: a notice.
 *
 * Both are dismissible: the X hides the banner for {@link BANNER_DISMISSAL_TTL_MS},
 * persisted per thread, and it re-surfaces only after that window for the next
 * pressure episode. "Clean up resources…" opens a visible agent thread carrying the
 * protection brief so an agent leads the cleanup.
 */
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect, useMemo } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useStableCallback } from "../../hooks/useStableCallback";
import { readThreadShell } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useT3TeamThreadFacts } from "../../state/t3team-threadSideStreams";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import { isResourcePressureBannerSuppressed } from "./t3team-ResourcePressureThreadBanner.logic";

/** The banner re-reads the server's cached sample at most this often (never triggers a scan). */
const BANNER_REFRESH_MS = 30_000;

/** The per-thread dismissal timestamp, persisted in localStorage. */
const DISMISSAL_SCHEMA = Schema.NullOr(Schema.Number);

/** Protection brief seeded into the cleanup agent thread. */
const RESOURCE_CLEANUP_BRIEF =
  "Clean up this machine's memory pressure. Work only on THIS session's T3 resources and " +
  "follow the safe-cleanup rules: stop finished background jobs and idle threads from this " +
  "session; remove this session's worktrees only when they are clean (never use " +
  "`git worktree remove --force`); kill only processes whose PID you obtained for this session, " +
  "never by name or pattern; never touch home-relative paths, the live install, or another " +
  "session's work. Report what you stopped and removed, and what you left on purpose.";

export function useResourcePressureBannerItem(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}): ComposerBannerStackItem | null {
  const { enabled, environmentId, threadId } = input;
  const active = enabled && environmentId !== null && threadId !== null;
  const query = useEnvironmentQuery(
    active ? serverEnvironment.resourcePressure({ environmentId, input: {} }) : null,
  );
  const { refresh } = query;
  const [dismissedAtMs, setDismissedAtMs] = useLocalStorage(
    `t3code:resource-pressure-dismissed:${environmentId ?? "env"}:${threadId ?? "thread"}`,
    null,
    DISMISSAL_SCHEMA,
  );
  const newThread = useNewThreadHandler();
  const onCleanUp = useStableCallback(() => {
    if (environmentId === null || threadId === null) return;
    const thread = readThreadShell(scopeThreadRef(environmentId, threadId));
    if (thread === null) return;
    void newThread(scopeProjectRef(environmentId, thread.projectId), {
      prompt: RESOURCE_CLEANUP_BRIEF,
    });
  });
  const onDismiss = useStableCallback(() => setDismissedAtMs(Date.now()));
  const clearDismissal = useStableCallback(() => setDismissedAtMs(null));
  // Polls the server's cached sample every 30s and, while a dismissal is pending, clears it once the
  // window passes so the next episode re-surfaces: a timer keeping the external poll and the
  // persisted dismissal in step while mounted.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 30s timer re-reads the server sample and expires the persisted dismissal
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      refresh();
      if (
        dismissedAtMs !== null &&
        !isResourcePressureBannerSuppressed(dismissedAtMs, Date.now())
      ) {
        clearDismissal();
      }
    }, BANNER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, clearDismissal, dismissedAtMs, refresh]);
  const paused =
    useT3TeamThreadFacts(active ? environmentId : null, threadId)?.resourcePressurePaused === true;
  const level = query.data?.snapshot?.level ?? "ok";
  const suppressed = dismissedAtMs !== null;
  const show = active && (paused || level !== "ok") && !suppressed;
  // Stable across unrelated host renders: the composer banner stack memoizes on it.
  return useMemo<ComposerBannerStackItem | null>(
    () =>
      show
        ? {
            id: "resource-pressure",
            variant: paused || level === "critical" ? "warning" : "info",
            group: "environment",
            icon: <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />,
            title: paused
              ? "Paused · memory pressure. Resumes automatically once it clears"
              : `Memory pressure ${level}`,
            actions: (
              <Button size="xs" variant="ghost" onClick={onCleanUp}>
                Clean up resources…
              </Button>
            ),
            dismissLabel: "Dismiss memory-pressure notice",
            onDismiss,
          }
        : null,
    [level, onCleanUp, onDismiss, paused, show],
  );
}
