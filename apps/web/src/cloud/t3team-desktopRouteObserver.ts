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
  /** Runs `work` once per request id to success; the submitting client shares the same one. */
  readonly once: (requestId: string, work: () => Promise<boolean>) => Promise<void>;
  readonly isClaimed: (requestId: string) => boolean;
  readonly primaryEnvironmentId: () => EnvironmentId | null;
  readonly sessions: () => Promise<
    ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>
  >;
  readonly grant: (grant: DesktopRouteGrant) => Promise<boolean>;
  readonly notify: (notice: { readonly title: string; readonly description: string }) => void;
}

const EXPIRED = {
  title: "Desktop route request expired",
  description: "It was answered while this computer was away. Ask the agent again.",
};

/** The submitting client's own grant: one claim with the observer, so one answer grants once. */
export const applyOwnDesktopRouteGrant = (
  requestId: string,
  grant: DesktopRouteGrant,
  deps: Pick<DesktopRouteObserverDeps, "once" | "grant">,
) => deps.once(requestId, () => deps.grant(grant));

/**
 * Applies a desktop-route answer made elsewhere (the phone) for a cloud session, from this desktop's
 * own client only; a thread-stream seam gives it each answer once. Fails closed: acted on once
 * (by id), only if this client saw the request pending and the answer arrive, only within the TTL;
 * anything else is a visible notice, never a grant. A failed grant is not claimed.
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
    const age =
      answered.resolvedAtMs === null ? Infinity : Math.max(0, deps.now() - answered.resolvedAtMs);
    if (!live && age > MISSED_NOTICE_WINDOW_MS) continue;
    if (deps.isClaimed(answered.requestId)) continue;
    await deps.once(answered.requestId, async () => {
      if (!live || age > DESKTOP_ROUTE_ANSWER_TTL_MS) {
        deps.notify(EXPIRED);
        return true;
      }
      const captured = captureDesktopRouteApply({
        questions: answered.questions,
        answers: answered.answers,
        threadEnvironmentId: event.environmentId,
        primaryEnvironmentId: primary,
        sessions: await deps.sessions().catch(() => []),
      });
      if (captured === null) return true;
      if (captured.grant === null) {
        deps.notify({ title: "Desktop route not set up", description: captured.problem });
        return true;
      }
      return deps.grant(captured.grant);
    });
  }
}
