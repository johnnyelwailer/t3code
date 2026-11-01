import type { ThreadAnswersResolved } from "@t3tools/client-runtime/state/thread-answers";
import {
  type CloudSession,
  type EnvironmentId,
  desktopRouteAcceptedFrom,
} from "@t3tools/contracts";

import { captureDesktopRouteApply, type DesktopRouteGrant } from "./t3team-desktopRouteCapture";
import { DESKTOP_ROUTE_ANSWER_TTL_MS } from "./t3team-desktopRouteClaims";

/** A request first seen already answered is only worth a notice while the answer is recent. */
const MISSED_NOTICE_WINDOW_MS = 60 * 60_000;

export interface DesktopRouteObserverDeps {
  readonly now: () => number;
  readonly claim: (requestId: string) => boolean;
  readonly primaryEnvironmentId: () => EnvironmentId | null;
  readonly sessions: () => Promise<
    ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>
  >;
  readonly grant: (grant: DesktopRouteGrant) => Promise<void>;
  readonly notify: (notice: { readonly title: string; readonly description: string }) => void;
}

const EXPIRED = {
  title: "Desktop route request expired",
  description: "It was answered while this computer was away. Ask the agent again.",
};

/**
 * Applies a desktop-route answer made on ANOTHER device (the phone) for a cloud session, and only
 * from this desktop's own client. Fails closed: a request is acted on once (claimed by id), only if
 * this client saw it pending and answered live, only within the TTL; anything else is a visible
 * notice, never a grant.
 */
export async function handleDesktopRouteAnswers(
  event: ThreadAnswersResolved,
  deps: DesktopRouteObserverDeps,
): Promise<void> {
  const primary = deps.primaryEnvironmentId();
  if (primary === null || event.environmentId === primary) return;
  for (const [answered, live] of [
    ...event.live.map((a) => [a, true] as const),
    ...event.missed.map((a) => [a, false] as const),
  ]) {
    if (desktopRouteAcceptedFrom(answered.questions, answered.answers) === null) continue;
    const age = answered.resolvedAtMs === null ? Infinity : deps.now() - answered.resolvedAtMs;
    if (!live && age > MISSED_NOTICE_WINDOW_MS) continue;
    if (!deps.claim(answered.requestId)) continue;
    if (!live || age > DESKTOP_ROUTE_ANSWER_TTL_MS) {
      deps.notify(EXPIRED);
      continue;
    }
    const captured = captureDesktopRouteApply({
      questions: answered.questions,
      answers: answered.answers,
      threadEnvironmentId: event.environmentId,
      primaryEnvironmentId: primary,
      sessions: await deps.sessions().catch(() => []),
    });
    if (captured === null) continue;
    if (captured.grant === null) {
      deps.notify({ title: "Desktop route not set up", description: captured.problem });
      continue;
    }
    await deps.grant(captured.grant);
  }
}
