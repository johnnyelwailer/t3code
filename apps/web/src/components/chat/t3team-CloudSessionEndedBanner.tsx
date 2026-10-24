import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { CloudOffIcon, ClockIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ENDED_SESSION_BANNER_COPY } from "~/cloud/t3team-endedSessionAction";
import { liveCloudSessionForEnvironment } from "~/cloud/t3team-cloudSessionEnvironmentMatch";
import {
  resolveSessionEndingNotice,
  secondsUntil,
  sessionEndsAtMs,
} from "~/cloud/t3team-cloudSessionEnding";
import { useEnvironmentSessionEnded } from "~/cloud/t3team-useEnvironmentLiveState";
import { useCloudSessions } from "~/state/t3team-cloudSessions";

import { CloudSessionEndedActions } from "../cloud/t3team-CloudSessionEndedActions";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

const UNAVAILABLE_BANNER_PREFIX = "environment-unavailable:";
const ENDED_BANNER_PREFIX = "cloud-session-ended:";

/**
 * The ended-session banner item: its copy and stack identity in one place, so the app and the
 * story build the same item. `actions` is the caller's (the production
 * `CloudSessionEndedActions` in the app, the fixture-driven view in the story).
 */
export function endedSessionBannerItem(
  environmentId: EnvironmentId,
  actions: ReactNode,
): ComposerBannerStackItem {
  return {
    id: `${ENDED_BANNER_PREFIX}${environmentId}`,
    variant: "warning",
    icon: <CloudOffIcon aria-hidden="true" />,
    title: ENDED_SESSION_BANNER_COPY.title,
    description: ENDED_SESSION_BANNER_COPY.description,
    actions,
  };
}

/**
 * Seconds left of the live cloud session serving `environmentId`, ticking locally: the session
 * list is polled conservatively, and a thread view does not poll it at all.
 */
function useSessionEnding(environmentId: EnvironmentId | null) {
  const { sessions } = useCloudSessions();
  const live =
    environmentId === null ? null : liveCloudSessionForEnvironment(sessions, environmentId);
  const endsAtMs = live?.phase === "ready" ? sessionEndsAtMs(live) : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const counting = endsAtMs !== null;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNowMs(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, [counting]);
  return {
    sessionId: live?.sessionId ?? null,
    secondsLeft: endsAtMs === null ? null : secondsUntil(endsAtMs, nowMs),
  };
}

/**
 * The composer banner for a thread whose cloud session has ended: the connection was parked on
 * `session_ended`, so "reconnecting" would be a lie and retrying is pointless. Before that, the
 * warning that it is about to. Null otherwise.
 */
export function useCloudSessionEndedBannerItem(
  environmentId: EnvironmentId | null,
  restartProjectId: ProjectId | null = null,
): ComposerBannerStackItem | null {
  const ended = useEnvironmentSessionEnded(environmentId);
  const { sessionId, secondsLeft } = useSessionEnding(environmentId);
  const notice = resolveSessionEndingNotice(secondsLeft);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  if (environmentId === null) return null;
  if (ended) {
    return endedSessionBannerItem(
      environmentId,
      <CloudSessionEndedActions
        environmentId={environmentId}
        restartProjectId={restartProjectId}
      />,
    );
  }
  if (notice === null || dismissedFor === sessionId) return null;
  return {
    id: `cloud-session-ending:${environmentId}`,
    variant: "warning",
    priority: "notice",
    icon: <ClockIcon aria-hidden="true" />,
    title: notice.title,
    description: notice.description,
    dismissLabel: "Dismiss session ending notice",
    onDismiss: () => setDismissedFor(sessionId),
  };
}

/**
 * Adds the ended banner to the composer's system banners and drops the generic "<env> is
 * offline" one it replaces. The composer stays gated by the environment being unavailable.
 */
export function withCloudSessionEndedBanner(
  items: ReadonlyArray<ComposerBannerStackItem>,
  ended: ComposerBannerStackItem | null,
): ComposerBannerStackItem[] {
  if (ended === null || !ended.id.startsWith(ENDED_BANNER_PREFIX)) {
    return ended === null ? [...items] : [...items, ended];
  }
  return [...items.filter((item) => !item.id.startsWith(UNAVAILABLE_BANNER_PREFIX)), ended];
}
